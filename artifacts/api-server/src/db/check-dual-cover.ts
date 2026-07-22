// Read-only check: prints the most recently updated track's cover fields
// so we can confirm (with real evidence, not a guess) whether the last
// Generate click actually populated coverUrlWide / coverBlurWide.
//
// Run with:  pnpm tsx src/db/check-dual-cover.ts
// (run from inside artifacts/api-server)

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const result = await pool.query(`
      SELECT id, title, cover_url, cover_url_wide, cover_blur_wide, updated_at
      FROM tracks
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 5;
    `);

    if (result.rows.length === 0) {
      console.log('No tracks found in the database.');
      return;
    }

    console.log(`\n--- Last ${result.rows.length} tracks by update time ---\n`);
    for (const row of result.rows) {
      console.log(`Title: ${row.title || '(untitled)'}  |  id: ${row.id}`);
      console.log(`  cover_url (square):      ${row.cover_url || '(empty)'}`);
      console.log(`  cover_url_wide (banner): ${row.cover_url_wide || '(empty)'}`);
      console.log(`  cover_blur_wide:         ${row.cover_blur_wide || '(empty)'}`);
      console.log(`  updated_at:              ${row.updated_at}`);
      console.log('');
    }
  } catch (err) {
    console.error('❌ Check failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
