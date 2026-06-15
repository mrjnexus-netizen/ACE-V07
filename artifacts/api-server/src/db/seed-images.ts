// ============================================================
// ACE-2026 — seed-images.ts (sample imagery)
// Sets a sample portrait on the composer identity, cover art on
// existing tracks, AND a distinct cover on every project.
//
// Project/track covers now point at the user's own local images in
// /public/media (served at /media/*). These are placeholders for local
// preview — replace later via the Admin Dashboard for deploy.
//
// Safe to re-run: it simply UPDATES existing rows.
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

// Portrait stays as the existing cinematic Pexels portrait (works in deploy too).
const PORTRAIT =
  "https://images.pexels.com/photos/11805707/pexels-photo-11805707.jpeg?auto=compress&cs=tinysrgb&w=1200";

// The user's own uploaded images, served locally from /public/media.
// (Local preview only — gitignored, replaced via Admin for deploy.)
const LOCAL = {
  mic: "/media/img-mic.jpg",
  piano: "/media/img-piano.jpg",
  sax: "/media/img-sax.jpg",
  notes: "/media/img-notes.jpg",
  producer: "/media/img-producer.jpg",
  band: "/media/img-band.jpg",
} as const;

// Covers for tracks (audio) — cycle through a musical subset.
const TRACK_COVERS = [LOCAL.piano, LOCAL.mic, LOCAL.notes, LOCAL.producer, LOCAL.sax, LOCAL.band];

// Distinct covers for projects — each one different.
const PROJECT_COVERS = [LOCAL.producer, LOCAL.piano, LOCAL.notes, LOCAL.mic, LOCAL.sax, LOCAL.band];

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

  // 2) Cover art on existing tracks.
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

  // 3) Distinct cover art on every project.
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
