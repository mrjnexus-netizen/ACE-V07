// One-off idempotent migration: adds the two new "dual cover art" columns
// directly via raw SQL, bypassing drizzle-kit's migration journal (which is
// desynced from the real DB state — see ACE-V07 session handoff notes).
//
// Run with:  pnpm tsx src/db/add-dual-cover-columns.ts
// (run from inside artifacts/api-server, same folder as the other
//  db/add-*.ts one-off scripts in this project)

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_url_wide TEXT;
    `);
    console.log('✅ cover_url_wide added (or already existed).');

    await pool.query(`
      ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_blur_wide TEXT;
    `);
    console.log('✅ cover_blur_wide added (or already existed).');

    console.log('✅ Migration complete — tracks table now has both new columns.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
