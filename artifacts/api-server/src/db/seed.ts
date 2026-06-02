import { db } from "./db";
import { adminUsers, composerIdentity } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import pino from "pino";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

const seed = async () => {
  logger.info("Starting database seeding...");

  // Seed Admin User
  const adminUsername = "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "adminpassword"; // Use a strong password in production
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  let existingAdmin = await db.query.adminUsers.findFirst({
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
  let existingComposerIdentity = await db.query.composerIdentity.findFirst();

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

seed().catch((err) => {
  logger.error("Database seeding failed:", err);
  process.exit(1);
});
