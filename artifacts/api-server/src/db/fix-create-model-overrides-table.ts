// One-off schema fix (2026-07-10): creates the new `model_overrides` table
// directly through the app's own DB connection — same approach as
// fix-generated-posters-schema.ts / fix-poster-template-category.ts, since
// drizzle-kit's migration journal is stuck behind an earlier out-of-band
// table (composer_portraits already exists, blocking every migration
// after it). Bypasses the journal entirely for this one table. Safe to
// run more than once (IF NOT EXISTS everywhere).
//
// Run with:  npx @dotenvx/dotenvx run -- npx tsx src/db/fix-create-model-overrides-table.ts

import { sql } from 'drizzle-orm';
import { db } from './db';

async function main() {
  console.log('Creating model_overrides table...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "model_overrides" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "kind" text NOT NULL,
      "provider_id" text NOT NULL,
      "model_id" text NOT NULL,
      "label" text NOT NULL,
      "quality" integer DEFAULT 3 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_model_overrides_unique"
    ON "model_overrides" ("kind", "provider_id", "model_id")
  `);
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Schema fix failed:', err);
  process.exit(1);
});
