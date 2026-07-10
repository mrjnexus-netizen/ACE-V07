// One-off verification script (2026-07-10): inserts ONE fake override row
// so Reza can prove the restart-survival fix actually works without
// waiting for a real AI provider to ship a new model. Attaches to the
// real 'openai' provider (a harmless, obviously-fake model id) so it's
// also visible in the Gatekeeper Hub text-model dropdown after restart,
// not just in a server log line. Run test-cleanup-model-override.ts
// afterward to remove it.
//
// Run with:  npx @dotenvx/dotenvx run -- npx tsx src/db/test-insert-model-override.ts

import { persistModelOverride } from '../services/aiProviders';

async function main() {
  console.log('Inserting test override row (provider: openai, model: gpt-test-verify-model)...');
  await persistModelOverride('text', 'openai', 'gpt-test-verify-model', 'TEST — Verify Persistence');
  console.log('Done.');
  console.log('Now restart the server (standard restart sequence) and check the terminal:');
  console.log('  look for a line starting with "[modelOverrides] Hydrated"');
  console.log('Then open Gatekeeper Hub -> OpenAI model dropdown -> "TEST — Verify Persistence" should be there.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test insert failed:', err);
  process.exit(1);
});
