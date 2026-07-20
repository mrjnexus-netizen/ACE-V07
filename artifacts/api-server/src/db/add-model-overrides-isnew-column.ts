// One-off idempotent migration: adds the new is_new column to
// model_overrides directly via raw SQL, bypassing drizzle-kit's
// migration journal (same recurring desync issue documented elsewhere
// in this project's migration scripts).
//
// Run with:  pnpm tsx src/db/add-model-overrides-isnew-column.ts
// (run from inside artifacts/api-server)

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      ALTER TABLE model_overrides ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT true;
    `);
    console.log('✅ is_new added to model_overrides (or already existed).');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
