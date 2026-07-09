import { randomUUID } from "node:crypto";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import { OpenAI } from "openai";
import { z } from "zod";

import { env } from "../config/env";
import { db } from "../db/db";
import { contentEntries, apiKeys } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
import { decrypt } from "../services/encryptionService";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";

const router: Router = Router();
const logger = createChildLogger("ContentRoutes");

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

/** Fetches + decrypts a stored API key by name. Returns null if missing/inactive. */
async function getDecryptedKey(keyName: string): Promise<string | null> {
  const record = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyName, keyName) });
  if (!record || !record.isActive) return null;
  try {
    return decrypt({ encryptedValue: record.encryptedValue, iv: record.iv, authTag: record.authTag });
  } catch {
    return null;
  }
}

const contentTypeSchema = z.enum(["text", "image", "audio", "link"]);
const localeSchema = z.enum(["en", "es", "fr", "zh", "ja", "ko"]);

const upsertSchema = z.object({
  locale: localeSchema,
  type: contentTypeSchema.default("text"),
  value: z.string().min(1, "Value is required"),
});

// GET /api/content
// Public (visitors need the resolved overrides too, not just admins in
// edit mode) — returns every override row. Small table, cheap to send
// whole; the frontend resolves per-key/per-locale fallback itself so it
// only needs one request for the whole session.
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.query.contentEntries.findMany();
    sendSuccess(res, rows, 200);
  } catch (error) {
    next(error);
  }
});

// PUT /api/content/:key
// Admin-only. Upserts the (key, locale) override.
router.put("/:key", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params;
    const { locale, type, value } = upsertSchema.parse(req.body);
    const adminId = req.user?.id;

    const existing = await db.query.contentEntries.findFirst({
      where: and(eq(contentEntries.key, key), eq(contentEntries.locale, locale)),
    });

    let row;
    if (existing) {
      [row] = await db
        .update(contentEntries)
        .set({ type, value, updatedAt: new Date(), updatedBy: adminId ?? null })
        .where(eq(contentEntries.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(contentEntries)
        .values({ key, locale, type, value, updatedBy: adminId ?? null })
        .returning();
    }

    logger.info({ requestId: req.id, key, locale }, "Content entry saved.");
    sendSuccess(res, row, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// DELETE /api/content/:key?locale=xx
// Admin-only. "Set-to-default": removes the override row so resolution
// falls back to the compiled-in default living in the component.
router.delete("/:key", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params;
    const locale = localeSchema.parse(req.query.locale);

    await db.delete(contentEntries).where(and(eq(contentEntries.key, key), eq(contentEntries.locale, locale)));

    logger.info({ requestId: req.id, key, locale }, "Content entry reset to default.");
    sendSuccess(res, { key, locale }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, "A valid locale query param is required", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// POST /api/content/:key/generate-text
// Admin-only. AI rewrite of the current text (LLM_NARRATIVE_API_KEY +
// optional LLM_NARRATIVE_MODEL, default gpt-4o-mini). Returns a
// SUGGESTION only — does not save; the admin reviews/edits it in the
// textarea and hits Save themselves, same as a manual edit.
const generateTextSchema = z.object({
  currentValue: z.string().default(""),
});

router.post("/:key/generate-text", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params;
    const { currentValue } = generateTextSchema.parse(req.body);

    const apiKey = await getDecryptedKey("LLM_NARRATIVE_API_KEY");
    if (!apiKey) {
      sendError(res, "LLM_NARRATIVE_API_KEY is not configured in Gatekeeper Hub yet.", "AI_NOT_CONFIGURED", 400);
      return;
    }
    const model = (await getDecryptedKey("LLM_NARRATIVE_MODEL")) || "gpt-4o-mini";

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You write copy for a luxury cinematic composer's portfolio website — evocative, precise, never flowery for its own sake. " +
            "Rewrite the given text: same language, roughly the same length, one clear improvement in rhythm or imagery. " +
            "Reply with ONLY the rewritten text — no quotes, no preamble, no explanation.",
        },
        {
          role: "user",
          content: currentValue
            ? currentValue
            : `Write one short, evocative line suitable for a content slot called "${key}" on this site.`,
        },
      ],
      temperature: 0.85,
      max_tokens: 220,
    });

    const suggestion = completion.choices[0]?.message?.content?.trim();
    if (!suggestion) {
      sendError(res, "The AI returned no suggestion — try again.", "AI_EMPTY_RESPONSE", 502);
      return;
    }
    sendSuccess(res, { suggestion }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    logger.error({ requestId: req.id, error }, "generate-text failed.");
    next(error);
  }
});

// POST /api/content/:key/generate-image
// Admin-only. AI image generation (AI_IMAGE_GENERATION_KEY + optional
// AI_IMAGE_GENERATION_MODEL, default dall-e-3), re-uploaded to our OWN
// S3 bucket (not left depending on OpenAI's temporary URL) under
// content/{key}/. Returns the url only — does not save; EditableImage's
// existing crop-in-place flow handles the rest, same as any other photo.
const generateImageSchema = z.object({
  prompt: z.string().optional(),
});

router.post("/:key/generate-image", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params;
    const { prompt } = generateImageSchema.parse(req.body);

    const apiKey = await getDecryptedKey("AI_IMAGE_GENERATION_KEY");
    if (!apiKey) {
      sendError(res, "AI_IMAGE_GENERATION_KEY is not configured in Gatekeeper Hub yet.", "AI_NOT_CONFIGURED", 400);
      return;
    }
    const model = (await getDecryptedKey("AI_IMAGE_GENERATION_MODEL")) || "dall-e-3";

    const finalPrompt =
      prompt ||
      "Photorealistic cinematic image suitable for a luxury composer's portfolio website. " +
        "Warm, moody key light with a cold rim light. Shallow depth of field. No text, no watermark, no visible faces of real people.";

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model,
      prompt: finalPrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      response_format: "url",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      sendError(res, "The AI returned no image — try again.", "AI_EMPTY_RESPONSE", 502);
      return;
    }

    const fetchResponse = await fetch(imageUrl);
    if (!fetchResponse.ok) {
      sendError(res, "Could not download the generated image.", "AI_DOWNLOAD_FAILED", 502);
      return;
    }
    const buffer = Buffer.from(await fetchResponse.arrayBuffer());
    const s3Key = `content/${key}/${randomUUID()}.png`;
    await s3Client.send(
      new PutObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME, Key: s3Key, Body: buffer, ContentType: "image/png" })
    );
    const fileUrl = `https://${env.AWS_S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${s3Key}`;

    sendSuccess(res, { url: fileUrl }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    logger.error({ requestId: req.id, error }, "generate-image failed.");
    next(error);
  }
});

export default router;
