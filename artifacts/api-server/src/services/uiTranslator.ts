import { redis } from '../db/redis';

/**
 * uiTranslator — live UI translation engine.
 *
 * Separate from services/translationService.ts (6-language batch translation
 * for dashboard content via the encrypted key store).
 *
 * Key design (rate-limit safe):
 *  - A whole screen's strings arrive in ONE /api/translate batch.
 *  - We de-duplicate, read Redis in a single MGET, and translate every
 *    cache-miss in ONE Groq request per chunk (NOT one request per string).
 *    This eliminates the 429 storms that previously left random strings stuck
 *    in English in random languages.
 *  - The single Groq call is retried a few times with backoff.
 *  - Only SUCCESSFUL translations are cached. A failure falls back to the
 *    source text and is NOT cached, so it self-heals on a later request.
 *  - Engine is isolated in callGroq(): swap that one function to change
 *    providers later without touching the rest of the app.
 */

const SUPPORTED = ['en', 'es', 'fr', 'zh', 'ja', 'ko'] as const;
type Lang = (typeof SUPPORTED)[number];

const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

// v2: bumped so any stale/partial entries from the old per-string path are ignored.
const CACHE_PREFIX = 'uitr:v2:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_PER_CALL = 60; // strings per single Groq request
const MAX_RETRIES = 3;

export function isSupportedLang(value: string): value is Lang {
  return (SUPPORTED as readonly string[]).includes(value);
}

/** Stable cache key for a (lang, text) pair. */
function cacheKey(lang: Lang, text: string): string {
  const safe = Buffer.from(text).toString('base64');
  return `${CACHE_PREFIX}${lang}:${safe}`;
}

function buildSystemPrompt(langName: string): string {
  return (
    `You are an elite localizer for a luxury cinematic film-composer's portfolio website. ` +
    `Translate each numbered UI string into ${langName}. ` +
    `Rules: keep the dramatic, premium, cinematic tone; use native, idiomatic, professional ` +
    `music-industry phrasing for that market (never literal/word-for-word); preserve any inline ` +
    `placeholders like {name} or %s exactly; do NOT translate proper nouns (people, brand names ` +
    `like "Amir Moslehi", "ACE"). ` +
    `Return EXACTLY one line per input, in the same order, each formatted as ` +
    `"<number>| <translation>", with no quotes, no blank lines, no commentary.`
  );
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The single point of contact with the AI engine. Swap to change providers. */
async function callGroq(messages: unknown): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      top_p: 0.9,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 160)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const out = data.choices?.[0]?.message?.content;
  if (!out || !out.trim()) throw new Error('Groq returned empty content');
  return out;
}

/**
 * Translate a list of UNIQUE strings in ONE Groq request (with retries).
 * Returns a Map of text -> translation for those that came back parseable.
 * Missing entries are simply absent (caller falls back to source).
 */
async function translateChunk(texts: string[], lang: Lang): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (texts.length === 0) return out;

  const numbered = texts.map((t, i) => `${i + 1}| ${t}`).join('\n');
  const messages = [
    { role: 'system', content: buildSystemPrompt(LANG_NAMES[lang]) },
    { role: 'user', content: numbered },
  ];

  let raw = '';
  let ok = false;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      raw = await callGroq(messages);
      ok = true;
      break;
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(700 * (attempt + 1)); // backoff, then retry the single call
        continue;
      }
      console.error('[uiTranslator] chunk failed after retries:', msg);
    }
  }
  if (!ok) return out; // all attempts failed -> caller uses source

  // Parse "<n>| <translation>" lines back to their inputs.
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(\d+)\s*\|\s?(.*)$/);
    if (!m) continue;
    const idx = parseInt(m[1] as string, 10) - 1;
    const val = (m[2] as string).trim();
    if (idx >= 0 && idx < texts.length && val) {
      const key = texts[idx] as string;
      out.set(key, val);
    }
  }
  return out;
}

/**
 * Batch translate. The frontend sends a whole screen's strings here.
 * One Groq request per chunk of cache-misses (no parallel-per-string storms).
 */
export async function translateUIBatch(texts: string[], targetLang: string): Promise<string[]> {
  if (!isSupportedLang(targetLang) || targetLang === 'en') {
    return texts.map((t) => t ?? '');
  }
  const lang = targetLang;

  const trimmedList = texts.map((t) => (t ?? '').trim());
  const result: Record<string, string> = {}; // text -> translation

  // 1) Unique non-empty strings, checked against Redis in a single MGET.
  const uniques = Array.from(new Set(trimmedList.filter((t) => t.length > 0)));
  if (uniques.length > 0) {
    const keys = uniques.map((t) => cacheKey(lang, t));
    let cachedVals: (string | null)[] = [];
    try {
      cachedVals = (await redis.mget(...keys)) as (string | null)[];
    } catch {
      cachedVals = keys.map(() => null);
    }

    const missing: string[] = [];
    uniques.forEach((t, i) => {
      const c = cachedVals[i];
      if (typeof c === 'string' && c.length > 0) result[t] = c;
      else missing.push(t);
    });

    // 2) Translate cache-misses, ONE Groq call per chunk; cache successes only.
    for (let i = 0; i < missing.length; i += MAX_PER_CALL) {
      const chunk = missing.slice(i, i + MAX_PER_CALL);
      const translated = await translateChunk(chunk, lang);

      let pipe: ReturnType<typeof redis.pipeline> | null = null;
      try {
        pipe = redis.pipeline();
      } catch {
        pipe = null;
      }
      for (const [text, val] of translated.entries()) {
        result[text] = val;
        if (pipe) pipe.set(cacheKey(lang, text), val, 'EX', CACHE_TTL_SECONDS);
      }
      if (pipe) {
        try {
          await pipe.exec();
        } catch {
          /* cache write failed — translations still returned */
        }
      }
    }
  }

  // 3) Re-map to ORIGINAL order. Anything still missing falls back to source
  //    (and was NOT cached, so it self-heals on a later request).
  return trimmedList.map((t, i) => {
    if (t.length === 0) return texts[i] ?? '';
    return result[t] ?? texts[i] ?? t;
  });
}

/**
 * Single-string translate (kept for API compatibility), routed through the
 * same batch path so behaviour and caching stay identical.
 */
export async function translateUI(text: string, targetLang: string): Promise<string> {
  const [only] = await translateUIBatch([text], targetLang);
  return only ?? text;
}
