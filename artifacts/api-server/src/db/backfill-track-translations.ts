import { eq } from 'drizzle-orm';

import { db } from './db';
import { tracks } from './schema';
import { translateToAllLocales } from '../services/localeCascadeTranslator';

/**
 * 2026-07-23 (per Reza): today's translation-cascade fix (pipeline.ts's
 * /approve/:jobId + tracks.ts's PUT/POST) only takes effect going forward
 * -- any track that was already published BEFORE the fix landed still has
 * empty/missing es/fr/zh/ja/ko values in its title/narrative columns,
 * which is why "Echoes in the Abyss" still showed up in English on the
 * Japanese page even after the fix was installed. This is a one-off,
 * idempotent backfill: for every existing track, if the English text is
 * present but any other locale is empty, cascade-translate it once and
 * save. Safe to re-run any time -- tracks that are already fully
 * translated are skipped (no wasted AI calls).
 *
 * Run with:
 *   npx @dotenvx/dotenvx run -- npx tsx src/db/backfill-track-translations.ts
 */

type MultiLingual = { en: string; es: string; fr: string; zh: string; ja: string; ko: string };

const LOCALES: Array<keyof MultiLingual> = ['es', 'fr', 'zh', 'ja', 'ko'];

function needsBackfill(field: unknown): field is MultiLingual {
  if (!field || typeof field !== 'object') return false;
  const obj = field as Record<string, unknown>;
  const en = typeof obj.en === 'string' ? obj.en.trim() : '';
  if (!en) return false; // nothing to translate from
  return LOCALES.some((loc) => !obj[loc] || (typeof obj[loc] === 'string' && !(obj[loc] as string).trim()));
}

async function run() {
  const all = await db.query.tracks.findMany();
  console.log(`[Backfill] Found ${all.length} track(s) total.`);

  let titleFixed = 0;
  let narrativeFixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const track of all) {
    try {
      let update: Record<string, unknown> = {};

      if (needsBackfill(track.title)) {
        const en = (track.title as MultiLingual).en;
        const fresh = await translateToAllLocales(en);
        update.title = fresh;
        titleFixed++;
        console.log(`[Backfill] Translating title for "${en}" (track ${track.id})...`);
      }

      if (needsBackfill(track.narrative)) {
        const en = (track.narrative as MultiLingual).en;
        const fresh = await translateToAllLocales(en);
        update.narrative = fresh;
        narrativeFixed++;
        console.log(`[Backfill] Translating narrative for track ${track.id}...`);
      }

      if (Object.keys(update).length > 0) {
        update.updatedAt = new Date();
        await db.update(tracks).set(update).where(eq(tracks.id, track.id));
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(`[Backfill] Failed on track ${track.id}:`, err);
    }
  }

  console.log('[Backfill] Done.');
  console.log(`[Backfill] Titles translated: ${titleFixed}`);
  console.log(`[Backfill] Narratives translated: ${narrativeFixed}`);
  console.log(`[Backfill] Skipped (already complete): ${skipped}`);
  console.log(`[Backfill] Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
