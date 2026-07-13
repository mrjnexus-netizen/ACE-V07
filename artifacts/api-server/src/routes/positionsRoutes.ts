import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";

import { db } from "../db/db";
import { positionLeads, positionReports } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
import { generateExcelReport } from "../services/positionScanner/excelReport";
import { rescoreAllLeads, runScan } from "../services/positionScanner/scan";
import { getSchedulerSettings, setDeliveryEmail, setSchedulerEnabled } from "../services/positionScanner/scheduler";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";

const router: Router = Router();
const logger = createChildLogger("PositionsRoutes");

// ============================================================
// Business Scanner (Phase 5 / A3c) — step 1 of the build: schema + this
// skeleton route (leads/reports CRUD, no scanning yet). The actual source
// adapters (RSS first, then Google Programmable Search, then AI-assisted
// scoring) land in the steps after this one — see MEGA_MASTER_v3 §5/§6.
// Everything here is intentionally source-agnostic: nothing assumes any
// adapter or API key exists yet.
// ============================================================

// GET /api/positions/leads?status=new&minScore=0&lang=en&source=rss
// Admin-only. Filtered, newest-first list.
const leadsQuerySchema = z.object({
  status: z.enum(["new", "reviewed", "dismissed"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  lang: z.string().optional(),
  source: z.string().optional(),
});

router.get("/leads", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, minScore, lang, source } = leadsQuerySchema.parse(req.query);
    const conditions = [
      status ? eq(positionLeads.status, status) : undefined,
      minScore !== undefined ? gte(positionLeads.score, minScore) : undefined,
      lang ? eq(positionLeads.lang, lang) : undefined,
      source ? eq(positionLeads.source, source) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const rows = await db.query.positionLeads.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: [desc(positionLeads.score), desc(positionLeads.firstSeen)],
      limit: 500, // a scan cadence of every 2h keeps this table small; a hard cap is just a sane ceiling, not expected to bind
    });
    sendSuccess(res, rows, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// PUT /api/positions/leads/:id  { status: 'reviewed' | 'dismissed' }
// Admin-only. The only mutation an admin makes directly on a lead —
// everything else (score, extracted fields) comes from the scan itself.
const updateLeadSchema = z.object({
  status: z.enum(["new", "reviewed", "dismissed"]),
});

router.put("/leads/:id", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = updateLeadSchema.parse(req.body);

    const [row] = await db
      .update(positionLeads)
      .set({ status, updatedAt: new Date() })
      .where(eq(positionLeads.id, id!))
      .returning();

    if (!row) {
      sendError(res, "Lead not found", "NOT_FOUND", 404);
      return;
    }
    sendSuccess(res, row, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// GET /api/positions/leads/summary — counts by status, for the admin tab's
// header stats without pulling every row.
router.get("/leads/summary", authGuard, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await db
      .select({ status: positionLeads.status, count: sql<number>`count(*)::int` })
      .from(positionLeads)
      .groupBy(positionLeads.status);
    const summary = { new: 0, reviewed: 0, dismissed: 0, total: 0 };
    for (const r of rows) {
      if (r.status === "new" || r.status === "reviewed" || r.status === "dismissed") {
        summary[r.status] = r.count;
      }
      summary.total += r.count;
    }
    sendSuccess(res, summary, 200);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/reports — past Excel reports, newest first.
router.get("/reports", authGuard, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await db.query.positionReports.findMany({
      orderBy: [desc(positionReports.createdAt)],
      limit: 100,
    });
    sendSuccess(res, rows, 200);
  } catch (error) {
    next(error);
  }
});

// POST /api/positions/scan — manual "Scan Now". Runs every wired source
// (RSS today) and inserts genuinely new leads. Safe to call repeatedly —
// dedup is enforced by the DB's own unique index on url.
router.post("/scan", authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await runScan();
    logger.info({ requestId: req.id, ...summary }, "Manual scan finished.");
    sendSuccess(res, summary, 200);
  } catch (err) {
    logger.error({ requestId: req.id, error: err }, "Scan failed.");
    const message = err instanceof Error ? err.message : "Scan failed.";
    sendError(res, message, "SCAN_ERROR", 500);
  }
});

// POST /api/positions/rescore — re-scores every existing lead against the
// CURRENT keyword rules (scoring.ts). Needed whenever that vocabulary
// changes: "Scan Now" only ever inserts NEW leads (dedup on url), so
// without this, leads already in the table stay stuck with whatever score
// they got under the OLD, narrower keyword list.
router.post("/rescore", authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await rescoreAllLeads();
    logger.info({ requestId: req.id, ...summary }, "Re-score finished.");
    sendSuccess(res, summary, 200);
  } catch (err) {
    logger.error({ requestId: req.id, error: err }, "Re-score failed.");
    const message = err instanceof Error ? err.message : "Re-score failed.";
    sendError(res, message, "RESCORE_ERROR", 500);
  }
});

// POST /api/positions/reports/generate — builds the Excel report from
// current leads right now (score >= 20, not dismissed), uploads to S3,
// and records it. This is the manual trigger; the scheduled 8AM Houston
// build (a later step, once hosting is decided) calls this exact same
// function — no separate report-building logic to keep in sync.
router.post("/reports/generate", authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await generateExcelReport();
    logger.info({ requestId: req.id, ...result }, "Report generated.");
    sendSuccess(res, result, 200);
  } catch (err) {
    logger.error({ requestId: req.id, error: err }, "Report generation failed.");
    const message = err instanceof Error ? err.message : "Report generation failed.";
    sendError(res, message, "REPORT_ERROR", 500);
  }
});

// GET /api/positions/settings — current schedule enabled/off + delivery email.
router.get("/settings", authGuard, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const settings = await getSchedulerSettings();
    sendSuccess(res, settings, 200);
  } catch (error) {
    next(error);
  }
});

// PUT /api/positions/settings — updates the schedule toggle and/or
// delivery email. Toggling `enabled` takes effect immediately (starts or
// stops the live cron tasks), not just on the next server restart.
const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  deliveryEmail: z.string().email().or(z.literal("")).optional(),
});

router.put("/settings", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = settingsSchema.parse(req.body);
    if (body.enabled !== undefined) await setSchedulerEnabled(body.enabled);
    if (body.deliveryEmail !== undefined) await setDeliveryEmail(body.deliveryEmail);
    const settings = await getSchedulerSettings();
    logger.info({ requestId: req.id, ...settings }, "Scanner settings updated.");
    sendSuccess(res, settings, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

export default router;
