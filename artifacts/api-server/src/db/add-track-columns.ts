// One-time migration helper: adds `concept` and `is_featured` columns to the
// tracks table (plus a concept index). Safe & idempotent — uses IF NOT EXISTS,
// touches nothing else (no primary keys, no other tables). Run once:
//   pnpm --filter @workspace/api-server exec tsx src/db/add-track-columns.ts
import 'dotenv/config';
import { db } from './db.js';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS concept text`);
  await db.execute(sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tracks_concept ON tracks(concept)`);
  console.log('COLUMNS ADDED OK');
  process.exit(0);
}

main().catch((err) => {
  console.error('MIGRATION FAILED:', err);
  process.exit(1);
});
