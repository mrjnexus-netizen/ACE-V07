import { randomUUID } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../db/db";
import { contentEntries } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
import { callTextProvider, callImageProvider, resolveActiveTextProvider, resolveActiveImageProvider } from "../services/aiProviders";
import { getS3Config } from "../services/awsConfig";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";

const router: Router = Router();
const logger = createChildLogger("ContentRoutes");

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
// Admin-only. Uses whichever text provider+model the admin selected in
// Gatekeeper Hub (TEXT_AI_SELECTED) — no hardcoded default provider.
// Returns a SUGGESTION only — does not save; the admin reviews/edits it
// in the textarea and hits Save themselves, same as a manual edit.
const generateTextSchema = z.object({
  currentValue: z.string().default(""),
});

router.post("/:key/generate-text", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params;
    const { currentValue } = generateTextSchema.parse(req.body);

    const resolved = await resolveActiveTextProvider();
    if ("error" in resolved) {
      sendError(res, resolved.error, "AI_NOT_CONFIGURED", 400);
      return;
    }
    const { provider, model, apiKey } = resolved;

    const suggestion = await callTextProvider(
      provider,
      model,
      apiKey,
      "You write copy for a luxury cinematic composer's portfolio website — evocative, precise, never flowery for its own sake. " +
        "Rewrite the given text: same language, roughly the same length, one clear improvement in rhythm or imagery. " +
        "Reply with ONLY the rewritten text — no quotes, no preamble, no explanation.",
      currentValue ? currentValue : `Write one short, evocative line suitable for a content slot called "${key}" on this site.`
    );

    sendSuccess(res, { suggestion, provider: provider.label, model }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    logger.error({ requestId: req.id, error }, "generate-text failed.");
    const message = error instanceof Error ? error.message : "AI rewrite failed.";
    sendError(res, message, "AI_PROVIDER_ERROR", 502);
  }
});

// POST /api/content/:key/generate-image
// Admin-only. Uses whichever image provider+model the admin selected in
// Gatekeeper Hub (IMAGE_AI_SELECTED) — no hardcoded default provider.
// Re-uploaded to our OWN S3 bucket under content/{key}/ (not left
// depending on the provider's temporary URL). Returns the url only —
// does not save; EditableImage's existing crop-in-place flow handles
// the rest, same as any other photo.
const generateImageSchema = z.object({
  prompt: z.string().optional(),
});

router.post("/:key/generate-image", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key } = req.params;
    const { prompt } = generateImageSchema.parse(req.body);

    const resolved = await resolveActiveImageProvider();
    if ("error" in resolved) {
      sendError(res, resolved.error, "AI_NOT_CONFIGURED", 400);
      return;
    }
    const { provider, model, apiKey } = resolved;

    const finalPrompt =
      prompt ||
      "Photorealistic cinematic image suitable for a luxury composer's portfolio website. " +
        "Warm, moody key light with a cold rim light. Shallow depth of field. No text, no watermark, no visible faces of real people.";

    const buffer = await callImageProvider(provider, model, apiKey, finalPrompt);
    const s3 = await getS3Config();
    const s3Key = `content/${key}/${randomUUID()}.png`;
    await s3.client.send(
      new PutObjectCommand({ Bucket: s3.bucket, Key: s3Key, Body: buffer, ContentType: "image/png" })
    );
    const fileUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${s3Key}`;

    sendSuccess(res, { url: fileUrl, provider: provider.label, model }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    logger.error({ requestId: req.id, error }, "generate-image failed.");
    const message = error instanceof Error ? error.message : "AI image generation failed.";
    sendError(res, message, "AI_PROVIDER_ERROR", 502);
  }
});

export default router;
