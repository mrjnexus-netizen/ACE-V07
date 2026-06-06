import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AWS_ACCESS_KEY_ID: z.string().min(16),
  AWS_SECRET_ACCESS_KEY: z.string().min(16),
  AWS_REGION: z.string(),
  AWS_S3_BUCKET_NAME: z.string(),
  ENCRYPTION_MASTER_KEY: z.string().length(64), // 32-byte hex string
  JWT_SECRET: z.string().min(32),
  SMTP_SERVER: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().email(),
  SMTP_PASSWORD: z.string(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DEMO_MODE: z.coerce.boolean().default(false),
  FRONTEND_URL: z.string().url().default("http://localhost:18956"),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error("❌ Invalid environment variables:", parseResult.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parseResult.data;
