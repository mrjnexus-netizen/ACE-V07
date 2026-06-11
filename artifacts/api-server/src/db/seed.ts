import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import pino from "pino";

import { db } from "./db";
import { adminUsers, composerIdentity } from "./schema";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

const seed = async (): Promise<void> => {
  logger.info("Starting database seeding...");

  // Seed Admin User
  const adminUsername = "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "adminpassword"; // Use a strong password in production
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const existingAdmin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.username, adminUsername),
  });

  if (!existingAdmin) {
    await db.insert(adminUsers).values({
      username: adminUsername,
      passwordHash: hashedPassword,
    });
    logger.info("Admin user seeded.");
  } else {
    logger.info("Admin user already exists, skipping.");
  }

  // Seed Composer Identity
  const existingComposerIdentity = await db.query.composerIdentity.findFirst();

  if (!existingComposerIdentity) {
    await db.insert(composerIdentity).values({
      // All fields default to {} or [] as per schema
      name: { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
      tagline: { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
      biography: { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
      awards: [],
      studioAddress: { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
      socialLinks: { spotify: null, imdb: null, instagram: null, youtube: null },
    });
    logger.info("Composer identity seeded.");
  } else {
    logger.info("Composer identity already exists, skipping.");
  }

  logger.info("Database seeding complete.");
};

seed().catch((err: unknown) => {
  const error = err as Error;
  logger.error("Database seeding failed:", error);
  process.exit(1);
});