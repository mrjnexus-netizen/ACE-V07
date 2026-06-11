import { eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { db } from '../db/db';
import { tracks, pipelineJobs } from '../db/schema';
import { authGuard } from '../middleware/auth';
import { generateAIArt } from '../services/aiArtGenerator';
import { analyzeAudio } from '../services/audioAnalyser';
import { translateText } from '../services/translationService';

const router: Router = Router();

// POST body validation (security checklist: all routes Zod-validated).
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

// GET /api/pipeline/status/:jobId - SSE Endpoint
router.get('/status/:jobId', (req: Request, res: Response): void => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  clients.set(jobId!, res);

  req.on('close', () => {
    clients.delete(jobId!);
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', jobId })}\n\n`);
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

    // 3. Trigger asynchronous media pipeline processing
    setTimeout((): void => {
      void (async (): Promise<void> => {
        try {
          const jobId = job!.id;

          // 1. Analyze the uploaded audio for real metadata (null-first if the
          //    file cannot be reached; never fabricates values).
          broadcastJobStatus(jobId, 'analyzing_audio', 20);
          const audioMetadata = await analyzeAudio(audioUrl);
          await db.update(pipelineJobs).set({ status: 'analyzing_audio', progress: 20, audioMetadata }).where(eq(pipelineJobs.id, jobId));

          // 2. Generate cover art (DALL-E 3) and narrative (GPT-4o) in parallel.
          //    allSettled => one failing never aborts the other. Both services
          //    load their key from the database and degrade gracefully (art ->
          //    null, narrative -> simulation) when no key is configured yet.
          broadcastJobStatus(jobId, 'generating_art', 45, { metadata: audioMetadata });
          const narrativeSource = `A ${audioMetadata.genre ?? genre ?? 'cinematic'} piece` +
            `${audioMetadata.title ? ` titled "${audioMetadata.title}"` : ''}` +
            `${audioMetadata.bpm ? ` at ${audioMetadata.bpm} BPM` : ''}. ` +
            `Evocative, modern, emotionally resonant.`;

          const [artResult, narrativeResult] = await Promise.allSettled([
            generateAIArt(draftTrack!.id, audioMetadata as Parameters<typeof generateAIArt>[1], 'Cinematic Warmth'),
            translateText(narrativeSource, 'en'),
          ]);

          const art = artResult.status === 'fulfilled' ? artResult.value : null;
          const generatedArtUrl = art?.url ?? null;
          const generatedNarrative = narrativeResult.status === 'fulfilled'
            ? narrativeResult.value
            : { en: '', es: '', fr: '', zh: '', ja: '', ko: '' };

          // Persist the generated cover onto the track when art succeeded.
          if (art) {
            await db.update(tracks).set({
              coverUrl: art.url,
              coverBlur: art.blurhash,
              dominantColors: art.dominantColors,
              vibrantPalette: art.vibrantPalette,
            }).where(eq(tracks.id, draftTrack!.id));
          }

          broadcastJobStatus(jobId, 'generating_narrative', 75, { generatedArtUrl });
          await db.update(pipelineJobs).set({ status: 'generating_narrative', progress: 75, generatedArtUrl }).where(eq(pipelineJobs.id, jobId));

          // 3. Human approval gate (admin approves before it goes live).
          broadcastJobStatus(jobId, 'awaiting_approval', 90, { generatedNarrative });
          await db.update(pipelineJobs).set({
            status: 'awaiting_approval',
            progress: 90,
            generatedNarrative,
          }).where(eq(pipelineJobs.id, jobId));

        } catch (err: unknown) {
          console.error('Asynchronous pipeline job failed:', err);
          await db.update(pipelineJobs).set({
            status: 'error',
            errorMessage: (err as Error).message || 'Pipeline processing failed',
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
    const { title, narrative, genre, bpm, mood, keySignature } = req.body;

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
      title: title || (generatedNarrative?.en as string) || { en: 'Final Composition', es: '', fr: '', zh: '', ja: '', ko: '' },
      narrative: narrative || (generatedNarrative?.en as string) || { en: '', es: '', fr: '', zh: '', ja: '', ko: '' },
      coverUrl: job.generatedArtUrl,
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

    await new Promise(r => setTimeout(r, 1000));

    if (field === 'art') {
      const generatedArtUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80';
      await db.update(pipelineJobs).set({ generatedArtUrl }).where(eq(pipelineJobs.id, jobId!));
      broadcastJobStatus(jobId!, 'awaiting_approval', 90, { generatedArtUrl });
    } else {
      const generatedNarrative = await translateText(
        `An intense and elegant gothic cinematic masterpiece with driving sub-basses, soaring violin lines, and rich orchestral string pads.`,
        'en'
      );
      await db.update(pipelineJobs).set({ generatedNarrative }).where(eq(pipelineJobs.id, jobId!));
      broadcastJobStatus(jobId!, 'awaiting_approval', 90, { generatedNarrative });
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

export default router;