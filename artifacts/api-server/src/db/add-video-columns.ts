// One-off idempotent migration: adds the video-support columns directly
// via raw SQL, bypassing drizzle-kit's migration journal (same recurring
// desync issue documented in this project's other migration scripts).
//
// Run with:  pnpm tsx src/db/add-video-columns.ts
// (run from inside artifacts/api-server)

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      ALTER TABLE tracks ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'audio';
    `);
    console.log('✅ tracks.media_type added (or already existed).');

    await pool.query(`
      ALTER TABLE tracks ADD COLUMN IF NOT EXISTS video_url TEXT;
    `);
    console.log('✅ tracks.video_url added (or already existed).');

    await pool.query(`
      ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'audio';
    `);
    console.log('✅ pipeline_jobs.media_type added (or already existed).');

    console.log('✅ Migration complete — video upload support is ready in the database.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
