// 2026-07-14 (per Reza) — one-off migration script for the chat_logs
// table, following the same pattern already used for the position-scanner
// tables (drizzle-kit's migration journal has desynced before on this
// project — a plain idempotent CREATE TABLE IF NOT EXISTS script is the
// established fix for that). Run once, from artifacts/api-server:
//   npx tsx src/db/add-chat-logs-table.ts
//
// NOTE: this loads .env explicitly (import 'dotenv/config' below) because
// running tsx directly like this does NOT go through the pnpm dev
// pipeline that normally injects env vars — without it, DATABASE_URL is
// missing and the pg client silently falls back to OS-level Postgres
// defaults (confirmed: this caused a real "role does not exist" error).
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './db';

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id TEXT NOT NULL,
      locale TEXT NOT NULL,
      messages JSONB NOT NULL DEFAULT '[]',
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_logs_conversation_id_unique
      ON chat_logs (conversation_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_chat_logs_updated_at
      ON chat_logs (updated_at);
  `);
  console.log('chat_logs table ready.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create chat_logs table:', err);
  process.exit(1);
});
