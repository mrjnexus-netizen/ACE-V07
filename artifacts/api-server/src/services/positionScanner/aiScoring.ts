// ============================================================
// Business Scanner — AI-assisted scoring + extraction (Phase 5 / A3c)
//
// Reads whichever text provider+model the admin already selected in
// Gatekeeper Hub (TEXT_AI_SELECTED, via resolveActiveTextProvider() —
// the exact same resolution content.ts's generate-text route already
// uses, no separate provider selection invented here). If nothing is
// configured, scoreLeadWithAI() returns null and the caller (scan.ts)
// falls straight back to the rule-based scorer — this is genuinely
// optional, never a hard dependency.
//
// What the AI pass adds that rules alone can't: structured extraction.
// The rule-based scorer can say "this looks relevant" but has no way to
// pull out the company name, contact person, or an email/contact channel
// buried in free text — that's exactly the kind of task an LLM is good at
// and keyword-matching isn't.
// ============================================================
import { callTextProvider, resolveActiveTextProvider } from '../aiProviders';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger('AiScoring');

export interface AiScoreResult {
  score: number; // 0-100
  lang: string;
  project: string | null;
  company: string | null;
  person: string | null;
  details: string | null;
  contacts: Record<string, string>;
}

const SYSTEM_PROMPT =
  'You triage job/project listings for a professional composer (film, TV, games, animation, documentary, ' +
  'advertising, trailers, theatre, dance, concert, immersive/VR, albums — plus sound design, sound engineering, ' +
  'mixing, mastering, orchestration, and every other craft discipline a working composer does). ' +
  'Given a listing\'s raw title and summary, reply with ONLY a single JSON object, no markdown fences, no prose:\n' +
  '{"score": 0-100, "lang": "ISO 639-1 code", "project": "short project/role name or null", ' +
  '"company": "hiring company/org or null", "person": "named contact person or null", ' +
  '"details": "1-2 sentence plain-English summary of what\'s actually being asked for, or null", ' +
  '"contacts": {"email": "or omit", "formUrl": "or omit", "phone": "or omit"}}\n' +
  'score reflects how likely this is GENUINE composing/audio-craft work for hire — not music-industry jobs in ' +
  'general (sales, legal, marketing, HR, executive/administrative roles score near 0 even if tagged "Music").';

/** Runs the AI pass on one lead. Returns null (never throws) if no text
 * AI provider is configured — callers should treat that as "fall back to
 * rules", not as an error. */
export async function scoreLeadWithAI(title: string, summary: string): Promise<AiScoreResult | null> {
  const resolved = await resolveActiveTextProvider();
  if ('error' in resolved) return null;
  const { provider, model, apiKey } = resolved;

  try {
    const reply = await callTextProvider(
      provider,
      model,
      apiKey,
      SYSTEM_PROMPT,
      `TITLE: ${title}\nSUMMARY: ${summary}`
    );
    const cleaned = reply.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<AiScoreResult>;

    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      lang: typeof parsed.lang === 'string' && parsed.lang ? parsed.lang : 'en',
      project: parsed.project || null,
      company: parsed.company || null,
      person: parsed.person || null,
      details: parsed.details || null,
      contacts: (parsed.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {}) as Record<string, string>,
    };
  } catch (err) {
    // A parsing/provider hiccup on ONE lead should never take down the
    // whole scan — log it and let the caller fall back to rules for just
    // this lead.
    logger.warn({ title, error: err instanceof Error ? err.message : err }, 'AI scoring failed for one lead — falling back to rules for it.');
    return null;
  }
}
