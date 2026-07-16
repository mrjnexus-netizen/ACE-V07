// One-off idempotent table creation for `document_analyses`, bypassing
// drizzle-kit's migration journal — same pattern as the project's existing
// fix-generated-posters-schema.ts / fix-poster-template-category.ts /
// add-chat-logs-table.ts scripts, used whenever the journal is at risk of
// desyncing from live DB state.
//
// Run with:
//   npx tsx src/db/add-document-analyses-table.ts
//
// (This project's env loading works via a plain `import 'dotenv/config'`
// at the top of one-off scripts — NOT dotenvx — per the fix applied to
// add-chat-logs-table.ts on 2026-07-15.)
import 'dotenv/config';

import { sql } from 'drizzle-orm';

import { db } from './db';

async function main() {
  console.log('Creating document_analyses table...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS document_analyses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      source_file_url TEXT,
      summary TEXT,
      parties JSONB NOT NULL DEFAULT '[]',
      deliverables JSONB NOT NULL DEFAULT '[]',
      deadlines JSONB NOT NULL DEFAULT '[]',
      payment_terms JSONB NOT NULL DEFAULT '[]',
      timecodes JSONB NOT NULL DEFAULT '[]',
      risks JSONB NOT NULL DEFAULT '[]',
      checklist JSONB NOT NULL DEFAULT '[]',
      degraded BOOLEAN DEFAULT false,
      source_text_length INTEGER DEFAULT 0,
      truncated BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_analyses_created_at ON document_analyses (created_at);
  `);

  console.log('document_analyses table ready.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create document_analyses table:', err);
  process.exit(1);
});
