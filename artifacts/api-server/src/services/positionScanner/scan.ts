// ============================================================
// Business Scanner — scan orchestrator (Phase 5 / A3c)
//
// Runs every wired source, dedupes against what's already stored BEFORE
// scoring anything (so AI calls are never spent on leads that would just
// get discarded), then scores each genuinely-new lead — AI first if a
// text provider is configured (extracts company/person/contacts, not just
// a number), rules as the automatic fallback either way. Insert dedup
// still also relies on the DB's own unique index on `url` as a second,
// authoritative line of defense against races.
// ============================================================
import { eq, inArray } from 'drizzle-orm';

import { db } from '../../db/db';
import { positionLeads } from '../../db/schema';
import { createChildLogger } from '../../utils/logger';
import { scoreLeadWithAI } from './aiScoring';
import { scanGoogleSearch } from './googleSearchSource';
import { scanRssFeeds, type RawLead } from './rssSource';
import { scoreLeadByRules } from './scoring';

const logger = createChildLogger('PositionScanner');

// A ceiling on AI calls per scan run — keeps cost/time bounded even on a
// scan that turns up a lot of genuinely new leads at once. Anything beyond
// this cap still gets scored (by rules), just not AI-refined this run;
// "Re-score All" can pick up the rest later once under the cap, or the
// next scheduled scan naturally spreads the load.
const MAX_AI_SCORED_PER_SCAN = 25;

export interface ScanSummary {
  scanned: number;
  inserted: number;
  aiScored: number;
  sources: string[];
}

/** Runs a full scan across every wired source in parallel. RSS always
 * contributes; Google Search contributes automatically the moment
 * GOOGLE_SEARCH_CREDENTIALS is configured (googleSearchSource.ts no-ops
 * cleanly until then) — nothing here needs to change when that happens. */
export async function runScan(): Promise<ScanSummary> {
  const [rssLeads, googleLeads] = await Promise.all([scanRssFeeds(), scanGoogleSearch()]);
  const raw: RawLead[] = [...rssLeads, ...googleLeads];
  logger.info({ rss: rssLeads.length, googleSearch: googleLeads.length }, 'Sources returned raw leads.');

  // Dedup against what's already stored BEFORE scoring anything — the
  // whole reason this cap on AI calls is even affordable is that repeat
  // scans mostly re-discover the same postings, and those never reach the
  // scorer at all now.
  const candidateUrls = raw.map((l) => l.url);
  const existing = candidateUrls.length
    ? await db.query.positionLeads.findMany({
        where: inArray(positionLeads.url, candidateUrls),
        columns: { url: true },
      })
    : [];
  const existingUrls = new Set(existing.map((r) => r.url));
  const genuinelyNew = raw.filter((l) => !existingUrls.has(l.url));

  let inserted = 0;
  let aiScored = 0;

  for (const lead of genuinelyNew) {
    let ai = null as Awaited<ReturnType<typeof scoreLeadWithAI>>;
    if (aiScored < MAX_AI_SCORED_PER_SCAN) {
      ai = await scoreLeadWithAI(lead.title, lead.summary);
      if (ai) aiScored += 1;
    }
    const rules = scoreLeadByRules(lead.title, lead.summary);

    try {
      const result = await db
        .insert(positionLeads)
        .values(ai
          ? {
              source: lead.source,
              sourceUrl: lead.sourceUrl,
              url: lead.url,
              project: ai.project || lead.title,
              company: ai.company,
              person: ai.person,
              details: ai.details || lead.summary || null,
              contacts: ai.contacts,
              lang: ai.lang,
              score: ai.score,
              scoredBy: 'ai',
              status: 'new',
            }
          : {
              source: lead.source,
              sourceUrl: lead.sourceUrl,
              url: lead.url,
              project: lead.title,
              details: lead.summary || null,
              lang: rules.lang,
              score: rules.score,
              scoredBy: 'rules',
              status: 'new',
            })
        .onConflictDoNothing({ target: positionLeads.url })
        .returning({ id: positionLeads.id });
      if (result.length > 0) inserted += 1;
    } catch (err) {
      logger.warn({ url: lead.url, error: err instanceof Error ? err.message : err }, 'Failed to insert one lead — continuing with the rest.');
    }
  }

  const sources = ['rss', ...(googleLeads.length > 0 ? ['google-search'] : [])];
  logger.info({ scanned: raw.length, newAfterDedup: genuinelyNew.length, inserted, aiScored, sources }, 'Scan complete.');
  return { scanned: raw.length, inserted, aiScored, sources };
}

/** Cheap existence check the route can use to decide whether to even
 * attempt a scan (kept here, not in the route, so the "what counts as a
 * configured source" logic lives in one place). RSS needs nothing
 * configured, so this always returns true today — it exists so this logic
 * has somewhere to grow into if a future source genuinely requires setup
 * before ANY scan can run at all. */
export function hasAnySourceConfigured(): boolean {
  return true;
}

export interface RescoreSummary {
  rescored: number;
  changed: number;
}

/** Re-scores every EXISTING lead against the current keyword rules.
 * Needed because "Scan Now" only ever finds and inserts NEW leads (dedup
 * is keyed on url) — it never revisits rows already in the table. Without
 * this, expanding the keyword vocabulary would only ever affect leads
 * found from that point forward, leaving everything already scanned stuck
 * with stale scores from an older list.
 *
 * Deliberately rules-only, even when AI is configured: this only touches
 * rows still scoredBy: 'rules', so it can never clobber a more precise
 * AI-extracted result with a cruder rule-based one. Re-running the AI pass
 * on already-AI-scored leads is a distinct, separate operation (not yet
 * built) — this one's job is just "catch up the rules-only rows". */
export async function rescoreAllLeads(): Promise<RescoreSummary> {
  const rows = await db.query.positionLeads.findMany({
    where: eq(positionLeads.scoredBy, 'rules'),
  });

  let changed = 0;
  for (const row of rows) {
    const { score, lang } = scoreLeadByRules(row.project ?? '', row.details ?? '', row.lang ?? 'en');
    if (score !== row.score) {
      await db.update(positionLeads).set({ score, lang, updatedAt: new Date() }).where(eq(positionLeads.id, row.id));
      changed += 1;
    }
  }

  logger.info({ rescored: rows.length, changed }, 'Re-score complete.');
  return { rescored: rows.length, changed };
}
