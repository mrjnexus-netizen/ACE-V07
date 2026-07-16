// One-off idempotent column addition for `document_analyses.track_matches`,
// bypassing drizzle-kit's migration journal -- same pattern as this
// project's other fix-*.ts / add-*-table.ts scripts. Safe to run even if
// the column already exists (IF NOT EXISTS).
//
// Run with:
//   npx tsx src/db/add-document-analyses-track-matches-column.ts
import 'dotenv/config';

import { sql } from 'drizzle-orm';

import { db } from './db';

async function main() {
  console.log('Adding track_matches column to document_analyses...');

  await db.execute(sql`
    ALTER TABLE document_analyses
    ADD COLUMN IF NOT EXISTS track_matches JSONB NOT NULL DEFAULT '[]';
  `);

  console.log('track_matches column ready.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to add track_matches column:', err);
  process.exit(1);
});
