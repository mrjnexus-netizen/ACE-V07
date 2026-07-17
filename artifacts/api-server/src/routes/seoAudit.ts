// ============================================================
// SEO & Accessibility audit routes, 2026-07-16 (revised 2026-07-17
// after a real incident: chrome-launcher/lighthouse's own dependency
// tree is huge, and a single missing transitive dependency
// (lighthouse-logger's `marky`, discovered live) threw at MODULE LOAD
// TIME because it was a static top-level import in index.ts --
// crashing the entire API server, not just this feature. `runLighthouseAudit`
// and `analyzeAuditResults` are now imported dynamically, INSIDE the
// request handler, so the whole Lighthouse dependency tree is only ever
// touched at the moment "Run Audit" is actually clicked. If something in
// that tree is still broken, this ONE endpoint returns a clear error --
// the rest of the site (login, tracks, everything) is completely
// unaffected regardless.
// ============================================================
import { desc, eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';

import { db } from '../db/db';
import { seoAudits } from '../db/schema';
import { authGuard } from '../middleware/auth';

const router: Router = Router();

// Defaults to the local dev server -- see lighthouseAudit.ts's header
// comment. Set SEO_AUDIT_URL in the environment once the site has a
// real domain for a meaningful production audit.
const DEFAULT_AUDIT_URL = process.env.SEO_AUDIT_URL || 'http://localhost:18956';

function errJson(res: Response, status: number, error: string, code: string) {
  return res.status(status).json({ success: false, data: null, error, code, timestamp: new Date().toISOString() });
}
function okJson<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data, error: null, code: null, timestamp: new Date().toISOString() });
}

// ------------------------------------------------------------------
// POST /api/seo/audit/run -- runs a real Lighthouse audit, analyzes it
// with AI, saves the result, returns the full row.
// ------------------------------------------------------------------
router.post('/audit/run', authGuard, async (req: Request, res: Response) => {
  try {
    const targetUrl = typeof req.body?.url === 'string' && req.body.url.trim() ? req.body.url.trim() : DEFAULT_AUDIT_URL;

    // Lazy-loaded on purpose -- see the module header comment above.
    let runLighthouseAudit: typeof import('../services/lighthouseAudit').runLighthouseAudit;
    try {
      ({ runLighthouseAudit } = await import('../services/lighthouseAudit'));
    } catch (loadErr) {
      console.error('[seoAudit] Lighthouse dependencies failed to load:', loadErr);
      return errJson(
        res,
        500,
        'The Lighthouse audit engine could not be loaded (a dependency is likely missing or not installed correctly). Run `pnpm install` in artifacts/api-server and check the terminal for a "Cannot find module" error naming the missing package.',
        'LIGHTHOUSE_UNAVAILABLE'
      );
    }

    const audit = await runLighthouseAudit(targetUrl);

    let analysis: Awaited<ReturnType<typeof import('../services/seoAuditAnalysis').analyzeAuditResults>> | null = null;
    try {
      const { analyzeAuditResults } = await import('../services/seoAuditAnalysis');
      analysis = await analyzeAuditResults(audit);
    } catch (analysisErr) {
      console.warn('[seoAudit] AI analysis unavailable (non-fatal, raw audit still saved):', analysisErr);
    }

    const [row] = await db
      .insert(seoAudits)
      .values({
        auditedUrl: audit.auditedUrl,
        seoScore: audit.scores.seo,
        accessibilityScore: audit.scores.accessibility,
        performanceScore: audit.scores.performance,
        bestPracticesScore: audit.scores.bestPractices,
        issues: audit.issues,
        aiSummary: analysis?.summary || null,
        aiPriorities: analysis?.priorities || [],
      })
      .returning();

    return okJson(res, row);
  } catch (err: unknown) {
    console.error('[seoAudit] run failed:', err);
    return errJson(
      res,
      500,
      (err as Error).message || 'Failed to run the audit. Make sure Chrome is installed on this machine and the target URL is reachable.',
      'SERVER_ERROR'
    );
  }
});

// ------------------------------------------------------------------
// GET /api/seo/audit/history -- lightweight list (scores + date only)
// for the trend chart. Newest last, so the chart reads left-to-right.
// ------------------------------------------------------------------
router.get('/audit/history', authGuard, async (_req: Request, res: Response) => {
  try {
    const rows = await db.query.seoAudits.findMany({
      columns: {
        id: true,
        createdAt: true,
        seoScore: true,
        accessibilityScore: true,
        performanceScore: true,
        bestPracticesScore: true,
      },
      orderBy: [desc(seoAudits.createdAt)],
      limit: 60,
    });
    return okJson(res, rows.reverse());
  } catch (err: unknown) {
    console.error('[seoAudit] history failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to load audit history', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// GET /api/seo/audit/:id -- full detail (issues + AI analysis) for one
// past audit.
// ------------------------------------------------------------------
router.get('/audit/:id', authGuard, async (req: Request, res: Response) => {
  try {
    const row = await db.query.seoAudits.findFirst({ where: eq(seoAudits.id, req.params.id!) });
    if (!row) return errJson(res, 404, 'Audit not found', 'NOT_FOUND');
    return okJson(res, row);
  } catch (err: unknown) {
    console.error('[seoAudit] get failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to load audit', 'SERVER_ERROR');
  }
});

export default router;
