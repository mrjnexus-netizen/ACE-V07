/**
 * Scoped, one-off migration for the Business Scanner (Phase 5 / A3c, §6.4).
 * Creates ONLY `position_leads` and `position_reports` via raw SQL — does
 * NOT touch any other table. Same reasoning as add-content-entries-table.ts:
 * avoids drizzle-kit push's full-schema diff hitting unrelated pre-existing
 * drift on other tables. Safe to re-run — every statement is idempotent
 * (IF NOT EXISTS).
 *
 * Run with: npx tsx src/db/add-position-scanner-tables.ts
 */
import '../config/env'; // MUST be first: loads dotenv before `db` reads process.env.DATABASE_URL
import { pool } from './db';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS position_leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL,
      source_url TEXT,
      url TEXT NOT NULL,
      project TEXT,
      company TEXT,
      person TEXT,
      details TEXT,
      contacts JSONB NOT NULL DEFAULT '{}',
      lang TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      scored_by TEXT NOT NULL DEFAULT 'rules',
      status TEXT NOT NULL DEFAULT 'new',
      first_seen TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_position_leads_url_unique
      ON position_leads (url);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_position_leads_score
      ON position_leads (score);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_position_leads_status
      ON position_leads (status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_position_leads_first_seen
      ON position_leads (first_seen);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS position_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_url TEXT NOT NULL,
      lead_count INTEGER NOT NULL DEFAULT 0,
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_position_reports_created_at
      ON position_reports (created_at);
  `);

  console.log('position_leads and position_reports tables ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to create Business Scanner tables:', err);
  process.exit(1);
});
