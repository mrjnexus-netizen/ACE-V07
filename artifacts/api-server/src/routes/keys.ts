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

const SUPPORTED_KEY_NAMES = ["AI_IMAGE_GENERATION_KEY", "LLM_NARRATIVE_API_KEY", "YOUTUBE_API_DATA_V3"];

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

      // In a real application, you would make an actual API call to the respective service
      // using keyValue to test the connection.
      // For this mock, we\'ll just simulate success/failure.
      if (!SUPPORTED_KEY_NAMES.includes(keyName)) {
        return sendError(res, "Unsupported API key name for testing", "INVALID_KEY_NAME", 400);
      }

      // Simulate external API call success
      const testSuccess = keyValue.length > 10; // Basic check, replace with actual API call

      if (!testSuccess) {
        return sendError(res, "API key connection test failed.", "CONNECTION_FAILED", 400);
      }

      // Update testedAt timestamp in DB (only if successful)
      await db
        .update(apiKeys)
        .set({ testedAt: new Date(), isActive: true })
        .where(eq(apiKeys.keyName, keyName));
      logger.info({ requestId: req.id, keyName }, "API key connection test successful.");

      return sendSuccess(res, { keyName, status: "Connected" });
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
