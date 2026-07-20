// One-off idempotent migration: adds the new generated_art_url_wide
// column to pipeline_jobs directly via raw SQL, bypassing drizzle-kit's
// migration journal (same pattern used for add-dual-cover-columns.ts —
// this project's journal has repeatedly desynced from real DB state).
//
// Run with:  pnpm tsx src/db/add-pipeline-jobs-wide-column.ts
// (run from inside artifacts/api-server)

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS generated_art_url_wide TEXT;
    `);
    console.log('✅ generated_art_url_wide added to pipeline_jobs (or already existed).');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
