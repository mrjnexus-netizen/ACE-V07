/**
 * Scoped, one-off migration for email verification support. Adds ONLY
 * these columns to admin_users — does NOT touch any other table. Safe to
 * re-run.
 *
 * Run with: npx tsx src/db/add-email-verification-columns.ts
 */
import '../config/env';
import { pool } from './db';

async function main() {
  await pool.query(`
    ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS email_verification_required BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS pending_email_code TEXT,
      ADD COLUMN IF NOT EXISTS pending_email_target TEXT,
      ADD COLUMN IF NOT EXISTS pending_email_expires_at TIMESTAMPTZ;
  `);

  console.log('admin_users email verification columns ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Failed to add email verification columns:', err);
  process.exit(1);
});
