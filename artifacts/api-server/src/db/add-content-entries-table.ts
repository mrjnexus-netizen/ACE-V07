/**
 * Scoped, one-off migration for the G2/A3a content system (§6.4).
 * Creates ONLY `content_entries` via raw SQL — does NOT touch any other
 * table. Written this way specifically to avoid `drizzle-kit push`'s
 * full-schema diff, which hit an unrelated pre-existing drift on another
 * table (see: `error: column "id" is in a primary key`, 2026-07-08) and
 * refused to run before even reaching this table. Safe to re-run — both
 * statements are idempotent (IF NOT EXISTS).
 *
 * Run with: npx tsx src/db/add-content-entries-table.ts
 */
import '../config/env'; // MUST be first: loads dotenv before `db` reads process.env.DATABASE_URL
import { pool } from './db';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL,
      locale TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_entries_key_locale_unique
      ON content_entries (key, locale);
  `);

  console.log('content_entries table ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to create content_entries table:', err);
  process.exit(1);
});
