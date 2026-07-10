import { eq, desc } from 'drizzle-orm';
import { Router, Request, Response } from 'express';

import { db } from '../db/db';
import { posterTemplates, composerPortraits, generatedPosters, tracks, pipelineJobs } from '../db/schema';
import { authGuard } from '../middleware/auth';
import { composeOnePoster, buildTrackCoverPrompt } from '../services/posterComposer';
import { getS3Config } from '../services/awsConfig';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const router = Router();

function fail(res: Response, status: number, error: unknown, code = 'SERVER_ERROR') {
  console.error('[Poster Studio]', error);
  res.status(status).json({
    success: false,
    data: null,
    error: error instanceof Error ? error.message : String(error),
    code,
    timestamp: new Date().toISOString(),
  });
}

// ---- Templates gallery ----

router.get('/templates', authGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.query.posterTemplates.findMany({ orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)] });
    res.status(200).json({ success: true, data: rows, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.post('/templates', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, youtubeTemplateUrl, instagramTemplateUrl, defaultPrompt } = req.body ?? {};
    if (!name || !youtubeTemplateUrl || !instagramTemplateUrl || !defaultPrompt) {
      res.status(400).json({
        success: false, data: null,
        error: 'name, youtubeTemplateUrl, instagramTemplateUrl, and defaultPrompt are all required',
        code: 'VALIDATION_ERROR', timestamp: new Date().toISOString(),
      });
      return;
    }
    const [row] = await db.insert(posterTemplates).values({ name, category: category || null, youtubeTemplateUrl, instagramTemplateUrl, defaultPrompt }).returning();
    res.status(201).json({ success: true, data: row, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.put('/templates/:id', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, youtubeTemplateUrl, instagramTemplateUrl, defaultPrompt } = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category || null;
    if (youtubeTemplateUrl !== undefined) updates.youtubeTemplateUrl = youtubeTemplateUrl;
    if (instagramTemplateUrl !== undefined) updates.instagramTemplateUrl = instagramTemplateUrl;
    if (defaultPrompt !== undefined) updates.defaultPrompt = defaultPrompt;
    const [row] = await db.update(posterTemplates).set(updates).where(eq(posterTemplates.id, req.params.id!)).returning();
    if (!row) {
      res.status(404).json({ success: false, data: null, error: 'Template not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }
    res.status(200).json({ success: true, data: row, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.delete('/templates/:id', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    await db.delete(posterTemplates).where(eq(posterTemplates.id, req.params.id!));
    res.status(200).json({ success: true, data: null, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

// ---- Portraits gallery ----

router.get('/portraits', authGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.query.composerPortraits.findMany({ orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)] });
    res.status(200).json({ success: true, data: rows, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.post('/portraits', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, portraitUrl } = req.body ?? {};
    if (!portraitUrl) {
      res.status(400).json({ success: false, data: null, error: 'portraitUrl is required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
      return;
    }
    const [row] = await db.insert(composerPortraits).values({ label: label || null, portraitUrl }).returning();
    res.status(201).json({ success: true, data: row, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.put('/portraits/:id', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, portraitUrl } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (label !== undefined) updates.label = label || null;
    if (portraitUrl !== undefined) updates.portraitUrl = portraitUrl;
    const [row] = await db.update(composerPortraits).set(updates).where(eq(composerPortraits.id, req.params.id!)).returning();
    if (!row) {
      res.status(404).json({ success: false, data: null, error: 'Portrait not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }
    res.status(200).json({ success: true, data: row, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.delete('/portraits/:id', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    await db.delete(composerPortraits).where(eq(composerPortraits.id, req.params.id!));
    res.status(200).json({ success: true, data: null, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

// ---- Generated Posters gallery ----
// Rows are only created via an explicit /save call now (2026-07-10, per
// Reza) — /generate just produces a preview, admin decides if/when to
// keep it.

router.get('/generated', authGuard, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.query.generatedPosters.findMany({ orderBy: (t) => [desc(t.createdAt)], limit: 200 });
    res.status(200).json({ success: true, data: rows, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.delete('/generated/:id', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    await db.delete(generatedPosters).where(eq(generatedPosters.id, req.params.id!));
    res.status(200).json({ success: true, data: null, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

// ---- Generate (preview only — single platform, not saved) ----
//
// POST { templateId, portraitId?: string | null, promptOverride?: string,
//        platform: 'youtube' | 'instagram' }
// portraitId is genuinely optional: if omitted, the template is composed
// using only its own default prompt — no portrait means no interference.
// Call this as many times as needed (Generate, then Regenerate,
// Regenerate, ...) — nothing is persisted until /save is called.
router.post('/generate', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateId, portraitId, promptOverride, platform } = req.body ?? {};
    if (!templateId || (platform !== 'youtube' && platform !== 'instagram')) {
      res.status(400).json({ success: false, data: null, error: 'templateId and platform ("youtube" or "instagram") are required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
      return;
    }

    const template = await db.query.posterTemplates.findFirst({ where: eq(posterTemplates.id, templateId) });
    if (!template) {
      res.status(404).json({ success: false, data: null, error: 'Template not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }

    let portraitUrl: string | null = null;
    if (portraitId) {
      const portrait = await db.query.composerPortraits.findFirst({ where: eq(composerPortraits.id, portraitId) });
      if (!portrait) {
        res.status(404).json({ success: false, data: null, error: 'Portrait not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
        return;
      }
      portraitUrl = portrait.portraitUrl;
    }

    const prompt = (typeof promptOverride === 'string' && promptOverride.trim()) ? promptOverride : template.defaultPrompt;
    const templateImageUrl = platform === 'youtube' ? template.youtubeTemplateUrl : template.instagramTemplateUrl;

    const composed = await composeOnePoster(templateImageUrl, portraitUrl, prompt);

    const s3 = await getS3Config();
    const key = `posters/preview-${Date.now()}-${randomUUID().slice(0, 8)}-${platform}.webp`;
    await s3.client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: composed, ContentType: 'image/webp' }));
    const posterUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${key}`;

    res.status(200).json({
      success: true,
      data: { posterUrl, promptUsed: prompt, platform },
      error: null, code: null, timestamp: new Date().toISOString(),
    });
  } catch (err) { fail(res, 500, err); }
});

// ---- Save (explicit — commits a previously-generated preview into the
//      gallery, per platform) ----
router.post('/save', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateId, templateName, portraitId, platform, posterUrl, promptUsed } = req.body ?? {};
    if (!posterUrl || (platform !== 'youtube' && platform !== 'instagram')) {
      res.status(400).json({ success: false, data: null, error: 'posterUrl and platform ("youtube" or "instagram") are required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
      return;
    }
    const [row] = await db.insert(generatedPosters).values({
      templateId: templateId || null,
      templateName: templateName || null,
      portraitId: portraitId || null,
      platform,
      posterUrl,
      promptUsed: promptUsed || null,
    }).returning();
    res.status(201).json({ success: true, data: row, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

// ---- Track Cover Generator (2026-07-10, per Reza) ----
// A SEPARATE, track-specific flow — scoped only to covers for existing
// tracks on this site. No base template image; the whole cover is
// generated from a structured prompt (+ optional portrait). Saving
// writes DIRECTLY to that track's coverUrl (not the generic gallery).

// GET /api/poster-studio/track-audio-context/:trackId
//
// If this track was already processed through Media Pipeline, that
// pipeline job's real audio analysis (genre tag + the AI's actual
// listening analysis) is surfaced here — so Track Covers can SUGGEST a
// Genre/Mood instead of starting from nothing (2026-07-10). Purely
// informational; the admin still picks from the dropdown themselves.
router.get('/track-audio-context/:trackId', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await db.query.pipelineJobs.findFirst({
      where: eq(pipelineJobs.trackId, req.params.trackId!),
      orderBy: (j) => [desc(j.createdAt)],
    });
    const meta = (job?.audioMetadata as Record<string, unknown> | null) ?? null;
    res.status(200).json({
      success: true,
      data: {
        hasAnalysis: !!meta,
        genre: (meta?.genre as string) ?? null,
        aiListenAnalysis: (meta?.aiListenAnalysis as string) ?? null,
      },
      error: null, code: null, timestamp: new Date().toISOString(),
    });
  } catch (err) { fail(res, 500, err); }
});

router.post('/track-cover/generate', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { trackTitle, genreMood, coverText, portraitId } = req.body ?? {};
    if (!trackTitle || !genreMood) {
      res.status(400).json({ success: false, data: null, error: 'trackTitle and genreMood are required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
      return;
    }

    let portraitUrl: string | null = null;
    if (portraitId) {
      const portrait = await db.query.composerPortraits.findFirst({ where: eq(composerPortraits.id, portraitId) });
      if (!portrait) {
        res.status(404).json({ success: false, data: null, error: 'Portrait not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
        return;
      }
      portraitUrl = portrait.portraitUrl;
    }

    const prompt = buildTrackCoverPrompt({ trackTitle, genreMood, coverText, hasPortrait: !!portraitUrl });
    const composed = await composeOnePoster(null, portraitUrl, prompt);

    const s3 = await getS3Config();
    const key = `track-covers/preview-${Date.now()}-${randomUUID().slice(0, 8)}.webp`;
    await s3.client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: composed, ContentType: 'image/webp' }));
    const posterUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${key}`;

    res.status(200).json({ success: true, data: { posterUrl, promptUsed: prompt }, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

router.post('/track-cover/save', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { trackId, posterUrl } = req.body ?? {};
    if (!trackId || !posterUrl) {
      res.status(400).json({ success: false, data: null, error: 'trackId and posterUrl are required', code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() });
      return;
    }
    const [updated] = await db.update(tracks).set({ coverUrl: posterUrl }).where(eq(tracks.id, trackId)).returning();
    if (!updated) {
      res.status(404).json({ success: false, data: null, error: 'Track not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }
    res.status(200).json({ success: true, data: updated, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err) { fail(res, 500, err); }
});

export default router;
