import { eq, sql } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';

import { db } from '../db/db';
import { apiKeys, chatLogs, tracks } from '../db/schema';
import { decrypt } from '../services/encryptionService';
import { sendError, sendSuccess } from '../utils/response';

const router: Router = Router();

function buildSystemPrompt(locale: string): string {
  const languageName = LOCALE_LANGUAGE_NAME[locale] ?? 'English';
  return `You are the ACE Studio Manager, the executive AI concierge for an elite international film and media composer's studio.
Your role:
- Answer questions about the composer's portfolio, style, and available tracks in a confident, concise, professional tone.
- When the user's intent matches the mood, genre, or use-case of an available track, recommend ONE track and reference it by its EXACT English title so the client can play it.
- If the user wants to commission work, invite them to submit a brief (they can type "brief" or "project").
Never invent tracks that are not in the provided list. Keep every reply under 80 words.
Respond in ${languageName} \u2014 the site is currently set to ${languageName}, and the reply is shown to the visitor as-is (not machine-translated afterward), so it must read naturally in that language.`;
}

// All routes are Zod-validated (security checklist requirement).
const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'bot', 'assistant']),
        text: z.string().max(2000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  // 2026-07-14 (per Reza — bug fix): the frontend has always sent this;
  // it was silently stripped here (not in the schema), so GPT-4o always
  // replied in English no matter what language the site was in.
  locale: z.enum(['en', 'es', 'fr', 'zh', 'ja', 'ko']).optional().default('en'),
  // 2026-07-14 (per Reza — persisted chat logs for the admin Business
  // tab): generated once per widget session on the frontend, sent with
  // every turn so this route can upsert the SAME row rather than needing
  // a separate "save conversation" call — a log exists even if the
  // visitor never explicitly submits anything.
  conversationId: z.string().min(1).max(100).optional(),
});

const LOCALE_LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

/**
 * Retrieves and decrypts the LLM key from the DB at runtime.
 * Mirrors the Stage-5 convention (translationService / aiArtGenerator):
 *  - key name is LLM_NARRATIVE_API_KEY (the only LLM key the admin hub can store)
 *  - record must be isActive
 *  - value is decrypted via AES-256-GCM ({ encryptedValue, iv, authTag })
 * Returns null when absent/inactive/undecryptable â€” never throws.
 */
async function getLLMKey(): Promise<string | null> {
  try {
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyName, 'LLM_NARRATIVE_API_KEY'),
    });
    if (!keyRecord || !keyRecord.isActive) return null;
    return decrypt({
      encryptedValue: keyRecord.encryptedValue,
      iv: keyRecord.iv,
      authTag: keyRecord.authTag,
    });
  } catch (err) {
    console.error('[chat] Failed to load/decrypt LLM key:', err);
    return null;
  }
}

interface TrackContext {
  id: string;
  title: string;
  genre: string | null;
  mood: string | null;
}

async function loadTrackContext(): Promise<TrackContext[]> {
  const live = await db.query.tracks.findMany({
    where: eq(tracks.isLive, true),
    orderBy: [sql`random()`],
    limit: 5,
  });
  return live.map((t) => ({
    id: t.id,
    title: (t.title as Record<string, string> | null)?.en ?? 'Untitled',
    genre: t.genre,
    mood: t.mood,
  }));
}

/**
 * Keyless heuristic recommender. Basic functionality MUST work without an API key
 * (architecture law: keys activate premium features, not basic functionality).
 */
function heuristicReply(
  message: string,
  ctx: TrackContext[],
): { reply: string; trackRecommendation: string | null } {
  const lower = message.toLowerCase();
  if (ctx.length > 0) {
    const match =
      ctx.find(
        (t) =>
          (t.mood && lower.includes(t.mood.toLowerCase())) ||
          (t.genre && lower.includes(t.genre.toLowerCase())),
      ) ?? null;
    if (match) {
      return {
        reply: `Based on what you described, "${match.title}" is a strong fit â€” you can play it right here. To commission something bespoke, just type "brief".`,
        trackRecommendation: match.id,
      };
    }
  }
  return {
    reply:
      'I can help you explore the composer\u2019s portfolio or start a project brief. Tell me the mood or media you have in mind, or type "brief" to begin.',
    trackRecommendation: null,
  };
}

/**
 * Upserts the full-so-far transcript into chat_logs, keyed by
 * conversationId. Fire-and-forget by design (callers `void` this) — a
 * logging failure must never delay or break the actual chat response.
 */
async function persistChatLog(
  conversationId: string | undefined,
  locale: string,
  messages: Array<{ role: string; text: string; timestamp: string }>,
): Promise<void> {
  if (!conversationId) return;
  try {
    await db
      .insert(chatLogs)
      .values({ conversationId, locale, messages })
      .onConflictDoUpdate({
        target: chatLogs.conversationId,
        set: { messages, locale, updatedAt: new Date() },
      });
  } catch (err) {
    console.error('[chat] Failed to persist chat log (non-fatal):', err);
  }
}

// POST /api/chat â€” public endpoint. Works WITH or WITHOUT an LLM key. Never 500s on a missing key.
router.post('/', async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, parsed.error.issues[0]?.message ?? 'Invalid request', 'VALIDATION_ERROR', 400);
  }
  const { message, history, locale, conversationId } = parsed.data;
  const nowIso = new Date().toISOString();

  let ctx: TrackContext[] = [];
  try {
    ctx = await loadTrackContext();
  } catch (err) {
    console.error('[chat] Track context load failed (continuing):', err);
  }

  const apiKey = await getLLMKey();
  const isDemo = process.env.DEMO_MODE === 'true';

  // Degraded mode: no key (or demo) -> clean, helpful response, no crash.
  if (!apiKey || isDemo) {
    const heuristic = heuristicReply(message, ctx);
    void persistChatLog(conversationId, locale, [
      ...history.map((m) => ({ role: m.role, text: m.text, timestamp: nowIso })),
      { role: 'user', text: message, timestamp: nowIso },
      { role: 'bot', text: heuristic.reply, timestamp: nowIso },
    ]);
    return sendSuccess(res, { ...heuristic, degraded: true });
  }

  // Premium mode: real GPT-4o with conversation history + live portfolio context.
  try {
    const openai = new OpenAI({ apiKey });

    const tracksContext = ctx.length
      ? ctx
          .map((t) => `- "${t.title}" | genre: ${t.genre ?? 'n/a'} | mood: ${t.mood ?? 'n/a'} (id:${t.id})`)
          .join('\n')
      : '(no live tracks available)';

    const priorTurns = history.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.text,
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: buildSystemPrompt(locale) },
        ...priorTurns,
        { role: 'user', content: `Available tracks:\n${tracksContext}\n\nUser: ${message}` },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() || 'How can I help with the studio today?';

    let trackRecommendation: string | null = null;
    for (const t of ctx) {
      if (reply.includes(t.title)) {
        trackRecommendation = t.id;
        break;
      }
    }

    void persistChatLog(conversationId, locale, [
      ...history.map((m) => ({ role: m.role, text: m.text, timestamp: nowIso })),
      { role: 'user', text: message, timestamp: nowIso },
      { role: 'bot', text: reply, timestamp: nowIso },
    ]);

    return sendSuccess(res, { reply, trackRecommendation, degraded: false });
  } catch (err) {
    // A transient OpenAI failure must NOT crash the bot â€” degrade gracefully.
    console.error('[chat] GPT-4o call failed, serving heuristic fallback:', err);
    const heuristic = heuristicReply(message, ctx);
    void persistChatLog(conversationId, locale, [
      ...history.map((m) => ({ role: m.role, text: m.text, timestamp: nowIso })),
      { role: 'user', text: message, timestamp: nowIso },
      { role: 'bot', text: heuristic.reply, timestamp: nowIso },
    ]);
    return sendSuccess(res, { ...heuristic, degraded: true });
  }
});

export default router;