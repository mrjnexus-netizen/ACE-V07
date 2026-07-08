import { and, eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../db/db";
import { contentEntries } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
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

export default router;
