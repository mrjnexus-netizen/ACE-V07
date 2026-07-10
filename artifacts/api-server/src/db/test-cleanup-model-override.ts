// Cleanup for test-insert-model-override.ts (2026-07-10) — removes the fake
// test row from model_overrides once the persistence check is done. Safe
// to run even if the row is already gone.
//
// Run with:  npx @dotenvx/dotenvx run -- npx tsx src/db/test-cleanup-model-override.ts

import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { modelOverrides } from './schema';

async function main() {
  console.log('Removing test override row (provider: openai, model: gpt-test-verify-model)...');
  await db
    .delete(modelOverrides)
    .where(and(eq(modelOverrides.providerId, 'openai'), eq(modelOverrides.modelId, 'gpt-test-verify-model')));
  console.log('Done. (Restart the server once more so the fake model drops out of the dropdown too.)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
