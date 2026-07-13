// ============================================================
// Business Scanner — Google Programmable Search source adapter
// (Phase 5 / A3c, step 3)
//
// Fully wired, but genuinely optional: if GOOGLE_SEARCH_CREDENTIALS isn't
// configured yet (the common case until Reza adds a key), this adapter
// returns an empty array immediately — the scan still runs fine on RSS
// alone. Once configured, it starts contributing automatically, no other
// code needs to change.
//
// Query budget: Google's Custom Search JSON API free tier is 100 queries/
// day. The scheduler (a later step) runs every 2 hours = 12 scans/day, so
// each scan gets a conservative slice of that budget — MAX_QUERIES_PER_SCAN
// below — rather than firing one query per keyword (which would blow
// through the daily quota in a single scan). Queries are built from
// COMPOSER_QUERY_TERMS (scoring.ts) — the exact same vocabulary the rule-
// based scorer uses, so "what we search for" and "what we consider
// relevant" can never drift apart into two different lists.
// ============================================================
import { eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { apiKeys } from '../../db/schema';
import { decrypt } from '../encryptionService';
import { createChildLogger } from '../../utils/logger';
import { COMPOSER_QUERY_TERMS } from './scoring';
import type { RawLead } from './rssSource';

const logger = createChildLogger('GoogleSearchSource');

const MAX_QUERIES_PER_SCAN = 8;

interface GoogleSearchCredentials {
  apiKey: string;
  searchEngineId: string;
}

/** Reads GOOGLE_SEARCH_CREDENTIALS straight from the DB — same table,
 * same decrypt() call keys.ts's own /status route uses. No HTTP round-trip
 * to itself; this runs server-side alongside the rest of the scan. */
async function loadCredentials(): Promise<GoogleSearchCredentials | null> {
  const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyName, 'GOOGLE_SEARCH_CREDENTIALS') });
  if (!row?.encryptedValue) return null;
  try {
    const raw = decrypt({ encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag });
    const parsed = JSON.parse(raw) as Partial<GoogleSearchCredentials>;
    if (!parsed.apiKey || !parsed.searchEngineId) return null;
    return { apiKey: parsed.apiKey, searchEngineId: parsed.searchEngineId };
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : err }, 'Failed to decrypt/parse GOOGLE_SEARCH_CREDENTIALS — treating as not configured.');
    return null;
  }
}

/** A small, hand-picked set of "someone is hiring" phrasings crossed with
 * one representative term from each discipline bucket — broad enough to
 * catch real postings, specific enough not to burn the whole query budget
 * on near-duplicates. Extending language coverage later means adding more
 * phrasing templates here, not redesigning this function. */
function buildQueries(): string[] {
  const hiringPhrases = ['"seeking a composer"', '"hiring a composer"', '"looking for a composer"', '"now hiring" composer'];
  const disciplineSample = [
    COMPOSER_QUERY_TERMS.screenScoring[0],
    COMPOSER_QUERY_TERMS.gameAudio[0],
    COMPOSER_QUERY_TERMS.animation[0],
    COMPOSER_QUERY_TERMS.advertising[0],
    COMPOSER_QUERY_TERMS.theatreDanceConcert[0],
    COMPOSER_QUERY_TERMS.albums[0],
    COMPOSER_QUERY_TERMS.soundCraft[0],
  ].filter((t): t is string => !!t);

  const queries: string[] = [...hiringPhrases];
  for (const term of disciplineSample) {
    if (queries.length >= MAX_QUERIES_PER_SCAN) break;
    queries.push(`"${term}" hiring`);
  }
  return queries.slice(0, MAX_QUERIES_PER_SCAN);
}

interface GoogleSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
}
interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
  error?: { message?: string };
}

/** Runs the query budget against Google Programmable Search. Returns []
 * (never throws) if credentials aren't configured, keeping this a true
 * drop-in alongside RSS rather than something that can fail the whole scan. */
export async function scanGoogleSearch(): Promise<RawLead[]> {
  const creds = await loadCredentials();
  if (!creds) {
    logger.info('GOOGLE_SEARCH_CREDENTIALS not configured — skipping this source (RSS still runs).');
    return [];
  }

  const results: RawLead[] = [];
  const queries = buildQueries();

  for (const q of queries) {
    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', creds.apiKey);
      url.searchParams.set('cx', creds.searchEngineId);
      url.searchParams.set('q', q);
      url.searchParams.set('num', '10');

      const resp = await fetch(url.toString());
      const body = (await resp.json()) as GoogleSearchResponse;
      if (!resp.ok) {
        logger.warn({ q, status: resp.status, error: body.error?.message }, 'Google Search query failed — skipping this one query.');
        continue;
      }
      for (const item of body.items ?? []) {
        if (!item.link || !item.title) continue;
        results.push({
          source: 'google-search',
          sourceUrl: q,
          url: item.link,
          title: item.title,
          summary: item.snippet || '',
          publishedAt: null,
        });
      }
    } catch (err) {
      logger.warn({ q, error: err instanceof Error ? err.message : err }, 'Google Search request failed — skipping this one query.');
    }
  }

  return results;
}
