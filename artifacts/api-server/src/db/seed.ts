import { db } from "./db";
import { adminUsers, composerIdentity } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const seed = async () => {
  console.log("Starting database seeding...");

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
    console.log("Admin user seeded.");
  } else {
    console.log("Admin user already exists, skipping.");
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
    console.log("Composer identity seeded.");
  } else {
    console.log("Composer identity already exists, skipping.");
  }

  console.log("Database seeding complete.");
};

seed().catch((err) => {
  console.error("Database seeding failed:", err);
  process.exit(1);
});
