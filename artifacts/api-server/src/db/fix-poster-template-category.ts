// One-off schema fix (2026-07-10): adds the new `category` column to
// poster_templates directly through the app's own DB connection —
// same approach as fix-generated-posters-schema.ts, since drizzle-kit's
// migration journal doesn't reliably track tables that were created
// outside of `migrate` on this database. Safe to run more than once.
//
// Run with:  npx @dotenvx/dotenvx run -- npx tsx src/db/fix-poster-template-category.ts

import { sql } from 'drizzle-orm';
import { db } from './db';

async function main() {
  console.log('Adding category column to poster_templates...');
  await db.execute(sql`ALTER TABLE "poster_templates" ADD COLUMN IF NOT EXISTS "category" text`);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Schema fix failed:', err);
  process.exit(1);
});
