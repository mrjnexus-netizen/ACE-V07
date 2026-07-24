import { eq } from 'drizzle-orm';

import { db } from './db';
import { tracks, projects } from './schema';
import { translateToAllLocales } from '../services/localeCascadeTranslator';

/**
 * 2026-07-23 round 2 (per Reza): the same duplicate-of-English placeholder
 * bug found in `tracks` (from seed-content.ts's old `all()` helper) also
 * affects `projects` (the 12-concept Selected Works taxonomy) -- both
 * tables were seeded the same way. This supersedes the earlier
 * tracks-only backfill-track-translations.ts: it covers both tables and
 * detects BOTH failure modes -- a genuinely empty locale field, AND a
 * locale field that's non-empty but is just the English text copied in
 * verbatim (which the first backfill's simpler "is it empty" check
 * couldn't see). Safe to re-run any time; already-correct rows are
 * skipped.
 *
 * Run with:
 *   npx @dotenvx/dotenvx run -- npx tsx src/db/backfill-all-translations.ts
 */

type MultiLingual = { en: string; es: string; fr: string; zh: string; ja: string; ko: string };

const LOCALES: Array<keyof MultiLingual> = ['es', 'fr', 'zh', 'ja', 'ko'];

function needsBackfill(field: unknown): field is MultiLingual {
  if (!field || typeof field !== 'object') return false;
  const obj = field as Record<string, unknown>;
  const en = typeof obj.en === 'string' ? obj.en.trim() : '';
  if (!en) return false; // nothing to translate from
  return LOCALES.some((loc) => {
    const val = obj[loc];
    if (!val || (typeof val === 'string' && !val.trim())) return true;
    if (typeof val === 'string' && val.trim() === en) return true; // duplicate-of-English
    return false;
  });
}

async function backfillTracks() {
  const all = await db.query.tracks.findMany();
  let titleFixed = 0;
  let narrativeFixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const track of all) {
    try {
      const update: Record<string, unknown> = {};

      if (needsBackfill(track.title)) {
        const en = (track.title as MultiLingual).en;
        update.title = await translateToAllLocales(en);
        titleFixed++;
        console.log(`[Backfill:tracks] title "${en}" (${track.id})`);
      }

      if (needsBackfill(track.narrative)) {
        const en = (track.narrative as MultiLingual).en;
        update.narrative = await translateToAllLocales(en);
        narrativeFixed++;
        console.log(`[Backfill:tracks] narrative for ${track.id}`);
      }

      if (Object.keys(update).length > 0) {
        update.updatedAt = new Date();
        await db.update(tracks).set(update).where(eq(tracks.id, track.id));
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(`[Backfill:tracks] Failed on ${track.id}:`, err);
    }
  }

  console.log(`[Backfill:tracks] titles=${titleFixed} narratives=${narrativeFixed} skipped=${skipped} failed=${failed}`);
}

async function backfillProjects() {
  const all = await db.query.projects.findMany();
  let titleFixed = 0;
  let descriptionFixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of all) {
    try {
      const update: Record<string, unknown> = {};

      if (needsBackfill(project.title)) {
        const en = (project.title as MultiLingual).en;
        update.title = await translateToAllLocales(en);
        titleFixed++;
        console.log(`[Backfill:projects] title "${en}" (${project.id})`);
      }

      if (needsBackfill(project.description)) {
        const en = (project.description as MultiLingual).en;
        update.description = await translateToAllLocales(en);
        descriptionFixed++;
        console.log(`[Backfill:projects] description for ${project.id}`);
      }

      if (Object.keys(update).length > 0) {
        update.updatedAt = new Date();
        await db.update(projects).set(update).where(eq(projects.id, project.id));
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(`[Backfill:projects] Failed on ${project.id}:`, err);
    }
  }

  console.log(`[Backfill:projects] titles=${titleFixed} descriptions=${descriptionFixed} skipped=${skipped} failed=${failed}`);
}

async function run() {
  console.log('[Backfill] Starting tracks...');
  await backfillTracks();
  console.log('[Backfill] Starting projects...');
  await backfillProjects();
  console.log('[Backfill] Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
