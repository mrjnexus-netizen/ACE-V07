// One-off fix (2026-07-10): drizzle-kit's migration journal doesn't know
// migration 0001 already applied (the tables were created via an earlier
// `drizzle-kit push` attempt, not through `migrate`), so `db:migrate`
// keeps retrying 0001 from scratch and fails on "already exists" before
// it ever reaches 0002. This applies exactly what 0002 needed — nothing
// more — directly through the app's own DB connection. Every statement
// is IF-EXISTS/IF-NOT-EXISTS guarded, so it's safe to run more than once.
//
// Run with:  npx tsx src/db/fix-generated-posters-schema.ts

// NOTE (2026-07-10): env loading is handled by running this script
// through the dotenvx CLI (see instructions), not by importing dotenvx
// here — the package isn't resolvable as a direct import in this setup.

import { sql } from 'drizzle-orm';
import { db } from './db';

async function main() {
  console.log('Applying generated_posters platform/poster_url schema fix...');

  await db.execute(sql`ALTER TABLE "generated_posters" ADD COLUMN IF NOT EXISTS "platform" text`);
  await db.execute(sql`ALTER TABLE "generated_posters" ADD COLUMN IF NOT EXISTS "poster_url" text`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_generated_posters_platform" ON "generated_posters" USING btree ("platform")`);
  await db.execute(sql`ALTER TABLE "generated_posters" DROP COLUMN IF EXISTS "youtube_url"`);
  await db.execute(sql`ALTER TABLE "generated_posters" DROP COLUMN IF EXISTS "instagram_url"`);

  const countRes = await db.execute(sql`SELECT COUNT(*)::int AS count FROM "generated_posters"`);
  const rowCount = Number((countRes.rows?.[0] as { count?: number } | undefined)?.count ?? 0);

  if (rowCount === 0) {
    await db.execute(sql`ALTER TABLE "generated_posters" ALTER COLUMN "platform" SET NOT NULL`);
    await db.execute(sql`ALTER TABLE "generated_posters" ALTER COLUMN "poster_url" SET NOT NULL`);
    console.log('Table was empty — platform/poster_url set to NOT NULL. Done.');
  } else {
    console.log(
      `Table has ${rowCount} existing row(s) with no platform/poster_url value — ` +
      'left those two columns nullable for now so nothing breaks. ' +
      'Clean up (or delete) those stale rows via `pnpm db:studio`, then re-run this ' +
      'script once more to lock in the NOT NULL constraints.'
    );
  }

  console.log('Schema fix complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Schema fix failed:', err);
  process.exit(1);
});
