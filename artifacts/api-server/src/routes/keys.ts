import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../db/db";
import { apiKeys } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
import { encrypt } from "../services/encryptionService";
import { InternalError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";

const router: Router = Router();
const logger = createChildLogger("ApiKeysRoute");

// Single-value keys (one opaque secret string) vs. structured keys (a
// small JSON object of named fields — e.g. AWS needs an access key ID,
// a secret key, a region, AND a bucket name, not just one string).
// New external services extend one of these two lists — no route
// rewrite needed. Structured keys additionally get a real connection
// test (see /test below) instead of the generic "long enough" check.
const SUPPORTED_SIMPLE_KEYS = ["AI_IMAGE_GENERATION_KEY", "LLM_NARRATIVE_API_KEY", "YOUTUBE_API_DATA_V3"];
const SUPPORTED_STRUCTURED_KEYS = ["AWS_S3_CREDENTIALS"];
const SUPPORTED_KEY_NAMES = [...SUPPORTED_SIMPLE_KEYS, ...SUPPORTED_STRUCTURED_KEYS];

const awsCredentialsSchema = z.object({
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  region: z.string().min(1, "Region is required"),
  bucket: z.string().min(1, "Bucket name is required"),
  // Admin-declared, not verified — AWS doesn't expose a simple "is this
  // account still on the free tier" check via a plain API call (that
  // needs Cost Explorer + separate billing permissions, a much bigger
  // scope). This is just a note the admin keeps for themselves.
  tier: z.enum(["free", "paid"]).default("free"),
});

// Zod schema for API key creation/update
const apiKeySchema = z.object({
  keyName: z.enum(SUPPORTED_KEY_NAMES as [string, ...string[]], { message: "Invalid API key name" }),
  keyValue: z.string().min(1, "Key value cannot be empty"),
});

// POST /api/keys - Create or update an API key
router.post(
  "/",
  authGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyName, keyValue } = apiKeySchema.parse(req.body);

      // Structured keys (AWS S3, etc.) arrive as a JSON-stringified object
      // from the frontend — validate its shape before encrypting/storing,
      // same rigor as the simple string keys.
      if (SUPPORTED_STRUCTURED_KEYS.includes(keyName)) {
        try {
          const parsed = JSON.parse(keyValue);
          if (keyName === "AWS_S3_CREDENTIALS") awsCredentialsSchema.parse(parsed);
        } catch {
          return sendError(res, "Malformed credentials payload", "VALIDATION_ERROR", 400);
        }
      }

      const { encryptedValue, iv, authTag } = encrypt(keyValue);

      const existingKey = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyName, keyName),
      });

      if (existingKey) {
        // Update existing key
        await db
          .update(apiKeys)
          .set({ encryptedValue, iv, authTag, updatedAt: new Date(), isActive: true })
          .where(eq(apiKeys.keyName, keyName));
        logger.info({ requestId: req.id, keyName }, "API key updated successfully.");
      } else {
        // Create new key
        await db
          .insert(apiKeys)
          .values({ keyName, encryptedValue, iv, authTag, isActive: true });
        logger.info({ requestId: req.id, keyName }, "API key created successfully.");
      }
      return sendSuccess(res, { message: `API key ${keyName} saved successfully.` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      }
      logger.error({ requestId: req.id, error }, "Error managing API key.");
      next(new InternalError("Failed to manage API key."));
    }
  }
);

// GET /api/keys/status - Get status of all API keys (without revealing values)
router.get("/status", authGuard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await db.query.apiKeys.findMany();

    const status = keys.map((key) => ({
      id: key.id,
      keyName: key.keyName,
      isActive: key.isActive,
      isConfigured: !!key.encryptedValue, // True if encryptedValue exists
      testedAt: key.testedAt,
    }));

    return sendSuccess(res, status);
  } catch (error) {
    logger.error({ requestId: req.id, error }, "Error fetching API key status.");
    next(new InternalError("Failed to fetch API key status."));
  }
});

// POST /api/keys/test - Test connection for a specific API key (mock implementation)
router.post(
  "/test",
  authGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyName, keyValue } = apiKeySchema.parse(req.body);

      if (!SUPPORTED_KEY_NAMES.includes(keyName)) {
        return sendError(res, "Unsupported API key name for testing", "INVALID_KEY_NAME", 400);
      }

      let testSuccess = false;
      let testMessage = "";

      if (keyName === "AWS_S3_CREDENTIALS") {
        // Real test: actually try to reach the bucket with these exact
        // credentials, not a length check.
        try {
          const creds = awsCredentialsSchema.parse(JSON.parse(keyValue));
          const testClient = new S3Client({
            region: creds.region,
            credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
          });
          await testClient.send(new HeadBucketCommand({ Bucket: creds.bucket }));
          testSuccess = true;
          testMessage = `Connected to bucket "${creds.bucket}" in ${creds.region}.`;
        } catch (s3Error) {
          logger.warn({ requestId: req.id, error: s3Error }, "AWS S3 connection test failed.");
          testMessage = "Could not reach the bucket with these credentials — check the access key, secret, region, and bucket name.";
        }
      } else {
        // Simulated check for the remaining single-value keys — no
        // lightweight verification endpoint exists for these providers
        // yet. Replace per-service once each provider's real check is
        // wired.
        testSuccess = keyValue.length > 10;
        testMessage = testSuccess ? "Key format looks valid (not a live connection test)." : "Key looks too short to be valid.";
      }

      if (!testSuccess) {
        return sendError(res, testMessage || "API key connection test failed.", "CONNECTION_FAILED", 400);
      }

      // Update testedAt timestamp in DB (only if successful)
      await db
        .update(apiKeys)
        .set({ testedAt: new Date(), isActive: true })
        .where(eq(apiKeys.keyName, keyName));
      logger.info({ requestId: req.id, keyName }, "API key connection test successful.");

      return sendSuccess(res, { keyName, status: "Connected", message: testMessage });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      }
      logger.error({ requestId: req.id, error }, "Error testing API key.");
      next(new InternalError("Failed to test API key."));
    }
  }
);

export default router;
