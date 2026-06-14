// ============================================================
// ACE-2026 — seed-images.ts (sample imagery)
// Sets a sample portrait on the composer identity and sample cover
// art on the existing live tracks, using public Pexels image URLs so
// they work both locally and in any deployed/link preview.
//
// Safe to re-run: it simply UPDATES existing rows. These are
// placeholders — replace later via the Admin Dashboard.
//
// Run: pnpm --filter @workspace/api-server exec tsx src/db/seed-images.ts
// ============================================================

import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import pino from "pino";

import { db } from "./db";
import { composerIdentity, tracks } from "./schema";

const logger = pino({
  transport: { target: "pino-pretty", options: { colorize: true } },
});

// Public Pexels direct image URLs (stable CDN pattern).
const PORTRAIT =
  "https://images.pexels.com/photos/11805707/pexels-photo-11805707.jpeg?auto=compress&cs=tinysrgb&w=1200";
const COVERS = [
  "https://images.pexels.com/photos/8725223/pexels-photo-8725223.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/9224637/pexels-photo-9224637.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/1247591/pexels-photo-1247591.jpeg?auto=compress&cs=tinysrgb&w=800",
];

const seedImages = async (): Promise<void> => {
  logger.info("Seeding sample imagery...");

  // 1) Portrait on the composer identity.
  const identity = await db.query.composerIdentity.findFirst();
  if (identity) {
    await db
      .update(composerIdentity)
      .set({ portraitUrl: PORTRAIT })
      .where(eq(composerIdentity.id, identity.id));
    logger.info("Portrait set on composer identity.");
  } else {
    logger.warn("No composer identity found — run db:seed-content first.");
  }

  // 2) Cover art on existing tracks (cycle through the sample covers).
  const allTracks = await db.query.tracks.findMany({
    orderBy: [asc(tracks.sortOrder)],
  });
  if (allTracks.length === 0) {
    logger.warn("No tracks found — run db:seed-content first.");
  } else {
    let i = 0;
    for (const t of allTracks) {
      const cover = COVERS[i % COVERS.length]!;
      await db.update(tracks).set({ coverUrl: cover }).where(eq(tracks.id, t.id));
      i += 1;
    }
    logger.info(`Cover art set on ${allTracks.length} tracks.`);
  }

  logger.info("Sample imagery seeding complete.");
};

seedImages().catch((err: unknown) => {
  logger.error("Image seeding failed:", err as Error);
  process.exit(1);
});
