// ============================================================
// ACE-2026 — seed-images.ts (sample imagery)
// Sets a sample portrait on the composer identity, sample cover art
// on the existing live tracks, AND a distinct cover on every project,
// using public Pexels image URLs so they work both locally and in any
// deployed/link preview.
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
import { composerIdentity, tracks, projects } from "./schema";

const logger = pino({
  transport: { target: "pino-pretty", options: { colorize: true } },
});

// Public Pexels direct image URLs (stable CDN pattern).
const PORTRAIT =
  "https://images.pexels.com/photos/11805707/pexels-photo-11805707.jpeg?auto=compress&cs=tinysrgb&w=1200";

// Covers used for tracks (audio).
const TRACK_COVERS = [
  "https://images.pexels.com/photos/8725223/pexels-photo-8725223.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/9224637/pexels-photo-9224637.jpeg?auto=compress&cs=tinysrgb&w=800",
  "https://images.pexels.com/photos/1247591/pexels-photo-1247591.jpeg?auto=compress&cs=tinysrgb&w=800",
];

// Distinct, cinematic covers for projects — each one different so the
// portfolio reads as a varied body of work, not one repeated image.
const PROJECT_COVERS = [
  // moody concert / stage lighting
  "https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg?auto=compress&cs=tinysrgb&w=1280",
  // orchestra / strings
  "https://images.pexels.com/photos/995301/pexels-photo-995301.jpeg?auto=compress&cs=tinysrgb&w=1280",
  // cinema / film reel atmosphere
  "https://images.pexels.com/photos/7234256/pexels-photo-7234256.jpeg?auto=compress&cs=tinysrgb&w=1280",
  // neon / synth gaming vibe
  "https://images.pexels.com/photos/1644888/pexels-photo-1644888.jpeg?auto=compress&cs=tinysrgb&w=1280",
  // studio mixing desk
  "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=1280",
  // ambient / atmospheric landscape
  "https://images.pexels.com/photos/3617500/pexels-photo-3617500.jpeg?auto=compress&cs=tinysrgb&w=1280",
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
      const cover = TRACK_COVERS[i % TRACK_COVERS.length]!;
      await db.update(tracks).set({ coverUrl: cover }).where(eq(tracks.id, t.id));
      i += 1;
    }
    logger.info(`Cover art set on ${allTracks.length} tracks.`);
  }

  // 3) Distinct cover art on every project (ordered by createdAt).
  const allProjects = await db.query.projects.findMany({
    orderBy: [asc(projects.createdAt)],
  });
  if (allProjects.length === 0) {
    logger.warn("No projects found — run db:seed-content first.");
  } else {
    let j = 0;
    for (const p of allProjects) {
      const cover = PROJECT_COVERS[j % PROJECT_COVERS.length]!;
      await db.update(projects).set({ coverUrl: cover }).where(eq(projects.id, p.id));
      j += 1;
    }
    logger.info(`Cover art set on ${allProjects.length} projects.`);
  }

  logger.info("Sample imagery seeding complete.");
};

seedImages().catch((err: unknown) => {
  logger.error("Image seeding failed:", err as Error);
  process.exit(1);
});
