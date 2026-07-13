/**
 * Scoped, one-off migration for 2FA support. Adds ONLY two columns to
 * admin_users — does NOT touch any other table. Safe to re-run.
 *
 * Run with: npx tsx src/db/add-2fa-columns.ts
 */
import '../config/env';
import { pool } from './db';

async function main() {
  await pool.query(`
    ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
  `);

  console.log('admin_users 2FA columns ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to add 2FA columns:', err);
  process.exit(1);
});
