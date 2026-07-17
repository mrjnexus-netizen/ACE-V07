// One-off idempotent table creation for `seo_audits`, bypassing
// drizzle-kit's migration journal -- same pattern as this project's
// other add-*-table.ts scripts.
//
// Run with:
//   npx tsx src/db/add-seo-audits-table.ts
import 'dotenv/config';

import { sql } from 'drizzle-orm';

import { db } from './db';

async function main() {
  console.log('Creating seo_audits table...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seo_audits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      audited_url TEXT NOT NULL,
      seo_score INTEGER NOT NULL,
      accessibility_score INTEGER NOT NULL,
      performance_score INTEGER NOT NULL,
      best_practices_score INTEGER NOT NULL,
      issues JSONB NOT NULL DEFAULT '[]',
      ai_summary TEXT,
      ai_priorities JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_seo_audits_created_at ON seo_audits (created_at);
  `);

  console.log('seo_audits table ready.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create seo_audits table:', err);
  process.exit(1);
});
