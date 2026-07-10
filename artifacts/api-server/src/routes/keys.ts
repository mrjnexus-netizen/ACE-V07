import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../db/db";
import { apiKeys } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
import { encrypt, decrypt } from "../services/encryptionService";
import { InternalError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";
import { TEXT_PROVIDERS, IMAGE_PROVIDERS, findTextProvider, findImageProvider, callTextProvider } from "../services/aiProviders";
import { invalidateS3ConfigCache } from "../services/awsConfig";

const router: Router = Router();
const logger = createChildLogger("ApiKeysRoute");

// Single-value keys (one opaque secret string) vs. structured keys (a
// small JSON object of named fields — e.g. AWS needs an access key ID,
// a secret key, a region, AND a bucket name, not just one string).
// New external services extend one of these two lists — no route
// rewrite needed. Structured keys additionally get a real connection
// test (see /test below) instead of the generic "long enough" check.
//
// A3b (2026-07-08): AI provider keys are no longer a fixed short list —
// every provider in the aiProviders.ts registry gets its own key slot
// automatically, so adding an 11th provider later is a registry edit,
// not a route rewrite. TEXT_AI_SELECTED / IMAGE_AI_SELECTED are small
// structured keys recording which provider+model the admin picked —
// there is no hardcoded default; every "Generate" click reads these.
const SUPPORTED_SIMPLE_KEYS = [
  "YOUTUBE_API_DATA_V3",
  ...TEXT_PROVIDERS.map((p) => p.keyName),
  ...IMAGE_PROVIDERS.map((p) => p.keyName),
];
const aiSelectionSchema = z.object({ providerId: z.string().min(1), model: z.string().min(1) });
const SUPPORTED_STRUCTURED_KEYS = ["AWS_S3_CREDENTIALS", "TEXT_AI_SELECTED", "IMAGE_AI_SELECTED"];
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

// GET /api/keys/ai-providers — the full registry (id/label/models/docsUrl
// per provider, NOT the keys themselves), so the frontend can build the
// provider/model dropdowns without hardcoding anything on that side.
router.get("/ai-providers", authGuard, (_req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      text: TEXT_PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        models: p.models,
        keyName: p.keyName,
        docsUrl: p.docsUrl,
        tier: p.tier,
        noKeyRequired: p.noKeyRequired,
      })),
      image: IMAGE_PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        models: p.models,
        keyName: p.keyName,
        docsUrl: p.docsUrl,
        tier: p.tier,
        noKeyRequired: p.noKeyRequired,
      })),
    },
    200
  );
});


// POST /api/keys - Create or update an API key
router.post(
  "/",
  authGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { keyName, keyValue } = apiKeySchema.parse(req.body);

      // Structured keys (AWS S3, AI provider selection, etc.) arrive as a
      // JSON-stringified object from the frontend — validate its shape
      // before encrypting/storing, same rigor as the simple string keys.
      if (SUPPORTED_STRUCTURED_KEYS.includes(keyName)) {
        try {
          const parsed = JSON.parse(keyValue);
          if (keyName === "AWS_S3_CREDENTIALS") awsCredentialsSchema.parse(parsed);
          if (keyName === "TEXT_AI_SELECTED") {
            const sel = aiSelectionSchema.parse(parsed);
            const provider = findTextProvider(sel.providerId);
            if (!provider || !provider.models.some((m) => m.id === sel.model)) {
              return sendError(res, "Unknown text provider or model.", "VALIDATION_ERROR", 400);
            }
          }
          if (keyName === "IMAGE_AI_SELECTED") {
            const sel = aiSelectionSchema.parse(parsed);
            const provider = findImageProvider(sel.providerId);
            if (!provider || !provider.models.some((m) => m.id === sel.model)) {
              return sendError(res, "Unknown image provider or model.", "VALIDATION_ERROR", 400);
            }
          }
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
      if (keyName === "AWS_S3_CREDENTIALS") invalidateS3ConfigCache();
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

// GET /api/keys/status - Get status + decrypted value of every stored key.
// Per Reza (2026-07-08): this route is already authGuard-protected, and
// the whole admin panel sits behind a login — hiding secrets from an
// admin who already authenticated just meant re-typing them after every
// refresh, no real security benefit gained. Anyone who could read this
// response could also just log into the admin panel directly.
router.get("/status", authGuard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await db.query.apiKeys.findMany();

    const status = keys.map((key) => {
      const base = {
        id: key.id,
        keyName: key.keyName,
        isActive: key.isActive,
        isConfigured: !!key.encryptedValue, // True if encryptedValue exists
        testedAt: key.testedAt,
      };
      if (!key.encryptedValue) return base;
      try {
        const value = decrypt({ encryptedValue: key.encryptedValue, iv: key.iv, authTag: key.authTag });
        return { ...base, value };
      } catch {
        // best-effort: if a row can't be decrypted for any reason, don't
        // fail the whole status list over it
        return base;
      }
    });

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

      const textProvider = TEXT_PROVIDERS.find((p) => p.keyName === keyName);
      const imageProvider = IMAGE_PROVIDERS.find((p) => p.keyName === keyName);

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
      } else if (textProvider) {
        // Real test: a genuine 1-word completion — cheap enough to run on
        // every click, and proves the key actually works with this exact
        // provider, not just that it's a plausible-looking string.
        try {
          const testModel = (req.body as { model?: string }).model || textProvider.models[0]!.id;
          const reply = await callTextProvider(
            textProvider,
            testModel,
            keyValue,
            "Reply with exactly one word: OK",
            "Connection test."
          );
          testSuccess = reply.trim().length > 0;
          testMessage = testSuccess ? `Connected to ${textProvider.label} (${testModel}).` : `${textProvider.label} returned an empty reply.`;
        } catch (providerError) {
          logger.warn({ requestId: req.id, provider: textProvider.id, error: providerError }, "AI provider connection test failed.");
          testMessage = providerError instanceof Error ? providerError.message : `Could not reach ${textProvider.label}.`;
        }
      } else if (imageProvider) {
        // Format-only check for image providers — a real test would mean
        // generating (and paying for) an actual image on every click.
        testSuccess = keyValue.length > 10;
        testMessage = testSuccess
          ? `Key format looks valid for ${imageProvider.label} (not a live image generation — that only happens on Generate).`
          : "Key looks too short to be valid.";
      } else {
        // Remaining single-value keys (YouTube data key, etc.) — no
        // lightweight verification endpoint wired for these yet.
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
