import { eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { db } from '../db/db';
import { tracks, pipelineJobs } from '../db/schema';
import { authGuard } from '../middleware/auth';
import { generateAIArt, generateArtDirection } from '../services/aiArtGenerator';
import { resolveActiveTextProvider, callTextProvider, findTextProvider } from '../services/aiProviders';
import { analyzeAudio } from '../services/audioAnalyser';

const router: Router = Router();

const NARRATIVE_TARGET_LANGUAGES: Array<[key: 'es' | 'fr' | 'zh' | 'ja' | 'ko', name: string]> = [
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['zh', 'Chinese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
];

type MultiLingualText = { en: string; es: string; fr: string; zh: string; ja: string; ko: string };

/**
 * Generates the English narrative via whichever text provider the admin
 * has set active (Gatekeeper Hub), then translates it into the other 5
 * languages using that SAME provider — one consistent AI throughout,
 * instead of the old setup where generation and translation quietly
 * depended on two different (and differently configured) services.
 * Degrades to blank strings, never throws — a caption failure should
 * never abort the whole pipeline job.
 */
async function generateNarrative(sourceDescription: string): Promise<MultiLingualText> {
  const blank: MultiLingualText = { en: '', es: '', fr: '', zh: '', ja: '', ko: '' };
  const systemPrompt =
    "You write short, evocative descriptions of music for a luxury cinematic composer's portfolio. " +
    'Two to three sentences. Precise, cinematic, never generic. Reply with ONLY the description.';

  const tryWithProvider = async (
    provider: Parameters<typeof callTextProvider>[0],
    model: string,
    apiKey: string
  ): Promise<MultiLingualText> => {
    const en = await callTextProvider(provider, model, apiKey, systemPrompt, sourceDescription);
    const translations = await Promise.allSettled(
      NARRATIVE_TARGET_LANGUAGES.map(([, langName]) =>
        callTextProvider(
          provider,
          model,
          apiKey,
          `Translate the following into ${langName}. Reply with ONLY the translation, no extra text.`,
          en
        )
      )
    );
    const result: MultiLingualText = { ...blank, en };
    NARRATIVE_TARGET_LANGUAGES.forEach(([code], i) => {
      const t = translations[i];
      result[code] = t.status === 'fulfilled' ? t.value : '';
    });
    return result;
  };

  const resolved = await resolveActiveTextProvider();
  if (!('error' in resolved)) {
    try {
      return await tryWithProvider(resolved.provider, resolved.model, resolved.apiKey);
    } catch (err) {
      console.warn('[Pipeline] Selected text provider failed, trying Pollinations fallback:', err);
    }
  } else {
    console.warn('[Pipeline] No text provider selected, trying Pollinations fallback:', resolved.error);
  }

  // Guarantee (2026-07-09): if the admin's chosen provider has no key, is
  // misconfigured, or fails outright, fall back to Pollinations (free, no
  // key) before giving up — "Generate" should keep working regardless of
  // what's selected in Gatekeeper Hub, as long as Pollinations is up.
  try {
    const pollinationsText = findTextProvider('pollinations-text');
    if (!pollinationsText) throw new Error('Pollinations text fallback provider not found in registry.');
    const result = await tryWithProvider(pollinationsText, 'default', '');
    console.log('[Pipeline] Pollinations fallback succeeded for narrative generation.');
    return result;
  } catch (err) {
    console.warn('[Pipeline] Narrative generation failed (both selected provider and fallback):', err);
    return blank;
  }
}

/** Builds the same source description fed to the text AI for a caption,
 * from a job's real audio metadata. Shared by /regenerate and
 * /sample-prompt so they can never drift apart. */
function buildNarrativeSource(audioMetadata: Record<string, unknown>): string {
  const listenAnalysis = audioMetadata.aiListenAnalysis as string | undefined;
  if (listenAnalysis) {
    // The AI's actual listening analysis (2026-07-09) — track-specific,
    // not a generic genre/BPM template.
    return `Here is what this specific piece of music actually sounds like: ${listenAnalysis}` +
      `${audioMetadata.title ? ` It's titled "${audioMetadata.title as string}".` : ''}`;
  }
  return `A ${(audioMetadata.genre as string) ?? 'cinematic'} piece` +
    `${audioMetadata.title ? ` titled "${audioMetadata.title as string}"` : ''}` +
    `${audioMetadata.bpm ? ` at ${audioMetadata.bpm as number} BPM` : ''}` +
    `${audioMetadata.keySignature ? ` in ${audioMetadata.keySignature as string}` : ''}. ` +
    `Evocative, modern, emotionally resonant.`;
}
// Guards malformed input only; downstream keeps using req.body unchanged.
const processSchema = z.object({
  audioUrl: z.string().min(1).optional(),
  youtubeUrl: z.string().min(1).optional(),
  title: z.string().nullish(),
  genre: z.string().nullish(),
}).passthrough().refine((d) => Boolean(d.audioUrl || d.youtubeUrl), {
  message: 'audioUrl or youtubeUrl is required',
});

const approveSchema = z.object({
  title: z.unknown().optional(),
  narrative: z.unknown().optional(),
  coverUrl: z.string().nullish(),
  genre: z.string().nullish(),
  bpm: z.union([z.string(), z.number()]).nullish(),
  mood: z.string().nullish(),
  keySignature: z.string().nullish(),
}).passthrough();

const regenerateSchema = z.object({
  field: z.string().nullish(),
}).passthrough();

// Store active SSE clients
const clients = new Map<string, Response>();

// Serializes a pipeline job row into the exact shape the frontend's
// onmessage handler expects.
const jobToStatusPayload = (job: {
  id: string;
  status: string | null;
  progress: number | null;
  audioMetadata: unknown;
  generatedArtUrl: string | null;
  generatedNarrative: unknown;
  errorMessage: string | null;
}) => ({
  type: 'STATUS_UPDATE',
  jobId: job.id,
  status: job.status,
  progress: job.progress,
  audioMetadata: job.audioMetadata ?? undefined,
  generatedArtUrl: job.generatedArtUrl ?? undefined,
  generatedNarrative: job.generatedNarrative ?? undefined,
  errorMessage: job.errorMessage ?? undefined,
});

// GET /api/pipeline/status-snapshot/:jobId - plain JSON polling endpoint.
//
// Added 2026-07-09 as a robust fallback alongside SSE. On the admin's
// machine, EventSource silently never received a single message in ANY
// browser (Chrome incognito, Firefox) despite the exact same server
// responding correctly to `curl -N` immediately — extensions, service
// workers, and the system proxy were all individually ruled out as the
// cause. Rather than keep chasing an environment-specific streaming quirk,
// the frontend now polls this ordinary endpoint every 2s instead. It's a
// normal request/response — the same kind that upload/process/login etc.
// have worked on this exact machine the entire time — so it sidesteps
// whatever was uniquely swallowing the streamed response.
router.get('/status-snapshot/:jobId', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const job = await db.query.pipelineJobs.findFirst({ where: eq(pipelineJobs.id, jobId!) });
    if (!job) {
      res.status(404).json({
        success: false,
        data: null,
        error: 'Pipeline job not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: jobToStatusPayload(job),
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to read job status',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/pipeline/status/:jobId - SSE Endpoint (kept for environments
// where it works; the frontend no longer depends on it exclusively — see
// status-snapshot above).
//
// Delivery is guaranteed two ways (2026-07-09 freeze fix):
//   1. On connect, the job's CURRENT state is read from the DB and sent
//      immediately — so any broadcast that fired before the browser
//      finished opening the connection (a real race: the first 20%
//      update fires ~100ms after /process returns) is never lost.
//   2. A 3-second heartbeat re-reads the DB and re-sends the current
//      state until the job completes — so even if an individual
//      broadcast is dropped anywhere along the way (proxy, buffering,
//      timing), the UI catches up within 3 seconds instead of freezing
//      forever. The DB is the source of truth; live broadcasts are just
//      the low-latency fast path on top.
router.get('/status/:jobId', (req: Request, res: Response): void => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Force headers out immediately so the browser fires EventSource.onopen
  // right away instead of waiting for the first body bytes.
  res.flushHeaders();

  clients.set(jobId!, res);

  const sendCurrentDbState = async (): Promise<void> => {
    try {
      const job = await db.query.pipelineJobs.findFirst({ where: eq(pipelineJobs.id, jobId!) });
      if (!job) return;
      res.write(`data: ${JSON.stringify(jobToStatusPayload(job))}\n\n`);
      if (job.status === 'complete' || job.status === 'error') {
        clearInterval(heartbeat);
      }
    } catch (err) {
      console.warn('[Pipeline SSE] Heartbeat DB read failed:', err);
    }
  };

  const heartbeat = setInterval(() => { void sendCurrentDbState(); }, 3000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(jobId!);
  });

  // Send initial connected event, then the job's current state right away.
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', jobId })}\n\n`);
  void sendCurrentDbState();
});

// Helper: Broadcast status update via SSE
export const broadcastJobStatus = (jobId: string, status: string, progress: number, data: Record<string, unknown> = {}): void => {
  const client = clients.get(jobId);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'STATUS_UPDATE', jobId, status, progress, ...data })}\n\n`);
  }
};

// POST /api/pipeline/process - Trigger pipeline
router.post('/process', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = processSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? 'audioUrl or youtubeUrl is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const { audioUrl, title, genre } = req.body;

    // 1. Create a draft track
    const [draftTrack] = await db.insert(tracks).values({
      title: { en: title || 'Untitled Piece', es: '', fr: '', zh: '', ja: '', ko: '' },
      narrative: { en: '', es: '', fr: '', zh: '', ja: '', ko: '' },
      audioUrl,
      coverUrl: null,
      genre: genre || 'cinematic',
      isLive: false,
    }).returning();

    // 2. Create the pipeline job
    const [job] = await db.insert(pipelineJobs).values({
      trackId: draftTrack!.id,
      status: 'uploading',
      progress: 10,
    }).returning();

    // 3. Trigger asynchronous audio analysis ONLY. Cover art and caption
    //    are never auto-started — each is a fully independent action the
    //    admin triggers explicitly (Generate button on its own box). This
    //    was a deliberate product decision (Reza, 2026-07-09): upload →
    //    preview → [admin decides what to generate, one box at a time].
    setTimeout((): void => {
      void (async (): Promise<void> => {
        try {
          const jobId = job!.id;

          broadcastJobStatus(jobId, 'analyzing_audio', 20, { message: 'Reading file metadata and having AI listen to the track…' });
          const audioMetadata = await analyzeAudio(audioUrl);
          await db.update(pipelineJobs).set({ status: 'analyzing_audio', progress: 20, audioMetadata }).where(eq(pipelineJobs.id, jobId));

          broadcastJobStatus(jobId, 'ready_for_review', 30, { audioMetadata, message: 'Ready — generate cover art and caption whenever you like.' });
          await db.update(pipelineJobs).set({ status: 'ready_for_review', progress: 30 }).where(eq(pipelineJobs.id, jobId));
        } catch (err: unknown) {
          console.error('Asynchronous audio analysis failed:', err);
          await db.update(pipelineJobs).set({
            status: 'error',
            errorMessage: (err as Error).message || 'Audio analysis failed',
          }).where(eq(pipelineJobs.id, job!.id));
          broadcastJobStatus(job!.id, 'error', 100, { error: (err as Error).message });
        }
      })();
    }, 100);

    res.status(202).json({
      success: true,
      data: { jobId: job!.id, trackId: draftTrack!.id },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Error starting pipeline:', err);
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to start media pipeline',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/pipeline/approve/:jobId - Publish track
router.post('/approve/:jobId', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? 'Invalid payload',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const { title, narrative, coverUrl, genre, bpm, mood, keySignature } = req.body;

    const job = await db.query.pipelineJobs.findFirst({
      where: eq(pipelineJobs.id, jobId!),
    });

    if (!job || !job.trackId) {
      res.status(404).json({
        success: false,
        data: null,
        error: 'Pipeline job not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await db.update(pipelineJobs).set({ status: 'publishing', progress: 95 }).where(eq(pipelineJobs.id, jobId!));
    broadcastJobStatus(jobId!, 'publishing', 95);
    await new Promise(r => setTimeout(r, 1000));

    const generatedNarrative = job.generatedNarrative as Record<string, unknown> | null;
    const audioMetadata = job.audioMetadata as Record<string, unknown> | null;

    await db.update(tracks).set({
      title: title || (audioMetadata?.title
        ? { en: audioMetadata.title as string, es: '', fr: '', zh: '', ja: '', ko: '' }
        : { en: 'Untitled Composition', es: '', fr: '', zh: '', ja: '', ko: '' }),
      // Manual override takes priority (per Reza's spec); otherwise the
      // FULL generated object — was previously falling back to just the
      // English STRING, storing malformed data in a column typed for the
      // {en,es,fr,zh,ja,ko} shape.
      narrative: narrative || generatedNarrative || { en: '', es: '', fr: '', zh: '', ja: '', ko: '' },
      // Manual thumbnail upload takes priority over the AI-generated one.
      coverUrl: coverUrl || job.generatedArtUrl,
      genre: genre || 'cinematic',
      bpm: bpm ? parseInt(bpm) : (audioMetadata?.bpm as number) || 110,
      mood: mood || (audioMetadata?.mood as string) || 'Cinematic',
      keySignature: keySignature || (audioMetadata?.keySignature as string) || 'D Minor',
      duration: (audioMetadata?.duration as number) || 180,
      isLive: true,
      updatedAt: new Date(),
    }).where(eq(tracks.id, job.trackId));

    await db.update(pipelineJobs).set({ status: 'complete', progress: 100 }).where(eq(pipelineJobs.id, jobId!));
    broadcastJobStatus(jobId!, 'complete', 100, { trackId: job.trackId });

    res.status(200).json({
      success: true,
      data: 'Track published successfully and is now LIVE',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Approval error:', err);
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to approve and publish track',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/pipeline/regenerate/:jobId
router.post('/regenerate/:jobId', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const parsed = regenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? 'Invalid payload',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const { field } = req.body;

    const job = await db.query.pipelineJobs.findFirst({
      where: eq(pipelineJobs.id, jobId!),
    });

    if (!job) {
      res.status(404).json({
        success: false,
        data: null,
        error: 'Pipeline job not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!job.trackId) {
      res.status(404).json({
        success: false,
        data: null,
        error: 'This pipeline job has no associated track to regenerate for.',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const audioMetadata = (job.audioMetadata as Record<string, unknown> | null) ?? {};

    if (field === 'art') {
      broadcastJobStatus(jobId!, 'ready_for_review', job.progress ?? 30, {
        message: 'Generating cover art with AI — this can take up to a minute…',
      });
      const art = await generateAIArt(job.trackId, audioMetadata as Parameters<typeof generateAIArt>[1], 'Cinematic Warmth');
      if (!art) {
        broadcastJobStatus(jobId!, 'ready_for_review', job.progress ?? 30, {
          message: 'Cover art generation failed — check the active image provider in Gatekeeper Hub.',
        });
        res.status(502).json({
          success: false,
          data: null,
          error: 'Image generation failed — check the active image provider in Gatekeeper Hub.',
          code: 'AI_PROVIDER_ERROR',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      await db.update(tracks).set({
        coverUrl: art.url,
        coverBlur: art.blurhash,
        dominantColors: art.dominantColors,
        vibrantPalette: art.vibrantPalette,
      }).where(eq(tracks.id, job.trackId));
      await db.update(pipelineJobs).set({ generatedArtUrl: art.url }).where(eq(pipelineJobs.id, jobId!));
      broadcastJobStatus(jobId!, 'ready_for_review', job.progress ?? 30, {
        generatedArtUrl: art.url,
        message: 'Cover art ready.',
      });
    } else {
      broadcastJobStatus(jobId!, 'ready_for_review', job.progress ?? 30, {
        message: 'Writing a caption with AI…',
      });
      const narrativeSource = buildNarrativeSource(audioMetadata);
      const generatedNarrative = await generateNarrative(narrativeSource);
      await db.update(pipelineJobs).set({ generatedNarrative }).where(eq(pipelineJobs.id, jobId!));
      broadcastJobStatus(jobId!, 'ready_for_review', job.progress ?? 30, {
        generatedNarrative,
        message: 'Caption ready.',
      });
    }

    res.status(200).json({
      success: true,
      data: 'Regeneration complete',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Regeneration failed:', err);
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Regeneration failed',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/pipeline/sample-prompt/:jobId?field=art|narrative
//
// Returns the EXACT prompt our own AI-director/caption-writer would use
// for this track — read-only, copy-only. Added 2026-07-09 so the admin
// always has a manual fallback: paste this into ChatGPT/Midjourney/etc.
// and upload the result by hand if automatic generation ever fails.
router.get('/sample-prompt/:jobId', authGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const field = req.query.field === 'narrative' ? 'narrative' : 'art';
    const job = await db.query.pipelineJobs.findFirst({ where: eq(pipelineJobs.id, jobId!) });
    if (!job) {
      res.status(404).json({ success: false, data: null, error: 'Pipeline job not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() });
      return;
    }
    const audioMetadata = (job.audioMetadata as Record<string, unknown> | null) ?? {};
    const prompt = field === 'narrative'
      ? buildNarrativeSource(audioMetadata)
      : await generateArtDirection(audioMetadata as Parameters<typeof generateArtDirection>[0]);
    res.status(200).json({ success: true, data: { prompt, field }, error: null, code: null, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to build sample prompt',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;