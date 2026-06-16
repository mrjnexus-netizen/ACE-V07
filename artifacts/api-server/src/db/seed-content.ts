import "dotenv/config";
import { eq } from "drizzle-orm";
import pino from "pino";

import { db } from "./db";
import { composerIdentity, projects, tracks } from "./schema";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

type Localized = Record<string, string>;

// Same text across all six supported locales (placeholder until real translations).
const all = (text: string): Localized => ({
  en: text,
  es: text,
  fr: text,
  zh: text,
  ja: text,
  ko: text,
});

const seedContent = async (): Promise<void> => {
  logger.info("Seeding sample content...");

  // 1) Composer identity: fill the empty handoff defaults with real sample content.
  const identityValues = {
    name: all("Amir Moslehi"),
    tagline: all("Composer of cinematic worlds"),
    biography: all(
      "Amir Moslehi is an international composer crafting orchestral and electronic scores for film, games, and immersive media. His work fuses classical depth with modern texture, building emotional arcs that move between intimate stillness and full-spectrum intensity."
    ),
    awards: [
      "Best Original Score - Aurora Film Festival 2024",
      "Sound of the Year - Nominee 2023",
    ],
    studioAddress: all("Studio A / Remote worldwide"),
    socialLinks: {
      spotify: "https://open.spotify.com/",
      imdb: "https://www.imdb.com/",
      instagram: "https://www.instagram.com/",
      youtube: "https://www.youtube.com/",
    },
  };

  const existingIdentity = await db.query.composerIdentity.findFirst();
  if (existingIdentity) {
    await db
      .update(composerIdentity)
      .set(identityValues)
      .where(eq(composerIdentity.id, existingIdentity.id));
    logger.info("Composer identity updated with sample content.");
  } else {
    await db.insert(composerIdentity).values(identityValues);
    logger.info("Composer identity inserted.");
  }

  // 2) Sample tracks: only seed if the table is empty (idempotent).
  const existingTracks = await db.query.tracks.findMany();
  if (existingTracks.length > 0) {
    logger.info(
      `Tracks already exist (${existingTracks.length}), skipping track seed.`
    );
  } else {
    const sampleTracks = [
      {
        title: all("Aurora Borealis"),
        narrative: all(
          "A slow bloom of strings beneath a shifting electronic sky - light folding over light."
        ),
        genre: "Orchestral",
        mood: "Ethereal",
        bpm: 72,
        keySignature: "D major",
        duration: 268,
        sortOrder: 1,
        isLive: true,
        dominantColors: ["#D4AF37", "#0F0F0F", "#888880"],
      },
      {
        title: all("Crimson Tide"),
        narrative: all(
          "Low brass and pulsing percussion drive a relentless current toward an inevitable horizon."
        ),
        genre: "Cinematic",
        mood: "Tense",
        bpm: 120,
        keySignature: "C minor",
        duration: 214,
        sortOrder: 2,
        isLive: true,
        dominantColors: ["#B8960C", "#1A1A1A", "#F5F5F0"],
      },
      {
        title: all("Silent Cartography"),
        narrative: all(
          "Sparse piano maps an empty landscape; every note is a coordinate in the quiet."
        ),
        genre: "Ambient",
        mood: "Contemplative",
        bpm: 60,
        keySignature: "A minor",
        duration: 322,
        sortOrder: 3,
        isLive: true,
        dominantColors: ["#242424", "#D4AF37", "#444440"],
      },
      {
        title: all("The Last Algorithm"),
        narrative: all(
          "Orchestra and synthesis collide - a machine learning how to feel, one phrase at a time."
        ),
        genre: "Electronic-Orchestral",
        mood: "Driving",
        bpm: 134,
        keySignature: "E minor",
        duration: 241,
        sortOrder: 4,
        isLive: true,
        dominantColors: ["#D4AF37", "#080808", "#B8960C"],
      },
      {
        title: all("Lacrimosa Reborn"),
        narrative: all(
          "A choir rises from silence, reshaping an old lament into something luminous and new."
        ),
        genre: "Choral",
        mood: "Sorrowful",
        bpm: 66,
        keySignature: "F minor",
        duration: 297,
        sortOrder: 5,
        isLive: true,
        dominantColors: ["#F5F5F0", "#2A2A2A", "#D4AF37"],
      },
      {
        title: all("Neon Monsoon"),
        narrative: all(
          "Warm analog synths fall like rain over a city that only exists after midnight."
        ),
        genre: "Synthwave",
        mood: "Nostalgic",
        bpm: 100,
        keySignature: "G minor",
        duration: 233,
        sortOrder: 6,
        isLive: true,
        dominantColors: ["#B8960C", "#0F0F0F", "#888880"],
      },
    ];

    await db.insert(tracks).values(sampleTracks);
    logger.info(`Seeded ${sampleTracks.length} sample tracks.`);
  }

  // 3) Sample projects: linked to the composer identity. Idempotent (only seeds
  //    when the composer has no projects yet). Twelve projects, one per concept,
  //    so the Works "piano" shows the full professional spread of key types.
  const identityRow = await db.query.composerIdentity.findFirst();
  if (identityRow) {
    const existingProjects = await db.query.projects.findMany({
      where: eq(projects.composerId, identityRow.id),
    });
    if (existingProjects.length > 0) {
      logger.info(
        `Projects already exist (${existingProjects.length}), skipping project seed.`
      );
    } else {
      const sampleProjects = [
        {
          composerId: identityRow.id,
          title: all("Echoes of Tomorrow"),
          type: "film",
          year: 2024,
          description: all(
            "An original orchestral score for a near-future science-fiction feature exploring memory and machine consciousness."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("The Hollow Crown"),
          type: "tv",
          year: 2024,
          description: all(
            "Recurring themes and season-long motifs for a prestige historical drama series."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Vanguard Protocol"),
          type: "game",
          year: 2023,
          description: all(
            "Adaptive electronic-orchestral music for a tactical AAA game, scaling in real time with on-screen intensity."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("The Cartographer's Daughter"),
          type: "animation",
          year: 2023,
          description: all(
            "A delicate, folk-tinged score for an award-winning animated short about a girl who maps imaginary worlds."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Northern Silence"),
          type: "documentary",
          year: 2022,
          description: all(
            "Ambient textures and field-recording-inspired soundscapes for a documentary on the vanishing Arctic."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Aurora — Brand Anthem"),
          type: "advertising",
          year: 2024,
          description: all(
            "A precise, memorable sonic identity composed for a global brand's flagship campaign."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Dominion — Main Trailer"),
          type: "trailer",
          year: 2024,
          description: all(
            "High-impact hybrid cues engineered to drive a blockbuster theatrical trailer."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("The Glass Garden"),
          type: "theatre",
          year: 2023,
          description: all(
            "A live chamber score for the stage, written to breathe with the performers each night."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Murmuration"),
          type: "dance",
          year: 2023,
          description: all(
            "A rhythm-led score for a contemporary ballet, tempo shaped as choreography."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Symphony No. 1 — Tidewater"),
          type: "concert",
          year: 2022,
          description: all(
            "A full-scale concert work for orchestra, premiered in the season's opening night."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Liminal Spaces"),
          type: "vr",
          year: 2024,
          description: all(
            "Spatial, fully immersive audio composed for a room-scale VR art installation."
          ),
        },
        {
          composerId: identityRow.id,
          title: all("Nightfall Sessions"),
          type: "album",
          year: 2023,
          description: all(
            "A long-form artist album released under the composer's own name — intimate and exploratory."
          ),
        },
      ];

      await db.insert(projects).values(sampleProjects);
      logger.info(`Seeded ${sampleProjects.length} sample projects.`);
    }
  }

  logger.info("Sample content seeding complete.");
};

seedContent().catch((err: unknown) => {
  const error = err as Error;
  logger.error("Content seeding failed:", error);
  process.exit(1);
});
