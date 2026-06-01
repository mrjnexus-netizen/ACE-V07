import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import { tracks, pipelineJobs } from '../db/schema';
import { authenticateJWT } from '../middleware/auth';
import { eq } from 'drizzle-orm';
import { translateText } from '../services/translationService';

const router: Router = Router();

// Store active SSE clients
const clients = new Map<string, Response>();

// GET /api/pipeline/status/:jobId - SSE Endpoint
router.get('/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  clients.set(jobId, res);

  req.on('close', () => {
    clients.delete(jobId);
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', jobId })}\n\n`);
});

// Helper: Broadcast status update via SSE
export const broadcastJobStatus = (jobId: string, status: string, progress: number, data: any = {}) => {
  const client = clients.get(jobId);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: 'STATUS_UPDATE', jobId, status, progress, ...data })}\n\n`);
  }
};

// POST /api/pipeline/process - Trigger pipeline
router.post('/process', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { audioUrl, title, genre } = req.body;

    if (!audioUrl) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'audioUrl is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

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
      trackId: draftTrack.id,
      status: 'uploading',
      progress: 10,
    }).returning();

    // 3. Trigger asynchronous media pipeline processing (simulation or background worker)
    // To ensure zero dependency friction during local development, we initiate a background simulation
    // that operates asynchronously but safely handles step-by-step updates.
    setTimeout(async () => {
      try {
        const jobId = job.id;

        // Stage: Analyzing Audio (20%)
        broadcastJobStatus(jobId, 'analyzing_audio', 20);
        await db.update(pipelineJobs).set({ status: 'analyzing_audio', progress: 20 }).where(eq(pipelineJobs.id, jobId));
        await new Promise(r => setTimeout(r, 1500));

        const audioMetadata = {
          dominantInstrument: 'Violin',
          bpm: 110,
          mood: 'Dramatically intense, cinematic, mysterious',
          keySignature: 'D Minor',
          duration: 180,
          title: title || 'Untitled Ascent',
        };

        // Stage: Generating Art (40%)
        broadcastJobStatus(jobId, 'generating_art', 45, { metadata: audioMetadata });
        await db.update(pipelineJobs).set({ status: 'generating_art', progress: 45, audioMetadata }).where(eq(pipelineJobs.id, jobId));
        await new Promise(r => setTimeout(r, 2000));

        const generatedArtUrl = 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=1200&q=80';

        // Stage: Generating Narrative (70%)
        broadcastJobStatus(jobId, 'generating_narrative', 75, { generatedArtUrl });
        await db.update(pipelineJobs).set({ status: 'generating_narrative', progress: 75, generatedArtUrl }).where(eq(pipelineJobs.id, jobId));
        await new Promise(r => setTimeout(r, 1500));

        // Generate dynamic narrative Liner Notes
        const generatedNarrative = await translateText(
          `A sweeping orchestral movement highlighting soaring solo violin lines layered over deep cinematic sub-bass pulses and dynamic gothic atmospheric pads. Perfect for epic cinematic highlights.`,
          'en'
        );

        // Stage: Awaiting Approval (90%)
        broadcastJobStatus(jobId, 'awaiting_approval', 90, { generatedNarrative });
        await db.update(pipelineJobs).set({
          status: 'awaiting_approval',
          progress: 90,
          generatedNarrative,
        }).where(eq(pipelineJobs.id, jobId));

      } catch (err: any) {
        console.error('Asynchronous pipeline job failed:', err);
        await db.update(pipelineJobs).set({
          status: 'error',
          errorMessage: err.message || 'Pipeline processing failed',
        }).where(eq(pipelineJobs.id, job.id));
        broadcastJobStatus(job.id, 'error', 100, { error: err.message });
      }
    }, 100);

    return res.status(202).json({
      success: true,
      data: { jobId: job.id, trackId: draftTrack.id },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error starting pipeline:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to start media pipeline',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/pipeline/approve/:jobId - Publish track
router.post('/approve/:jobId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { title, narrative, genre, bpm, mood, keySignature } = req.body;

    const job = await db.query.pipelineJobs.findFirst({
      where: eq(pipelineJobs.id, jobId),
    });

    if (!job || !job.trackId) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Pipeline job not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    // Complete the publishing
    await db.update(pipelineJobs).set({ status: 'publishing', progress: 95 }).where(eq(pipelineJobs.id, jobId));
    broadcastJobStatus(jobId, 'publishing', 95);
    await new Promise(r => setTimeout(r, 1000));

    // Update the track with finalized, approved details and make it live
    await db.update(tracks).set({
      title: title || job.generatedNarrative || { en: 'Final Composition', es: '', fr: '', zh: '', ja: '', ko: '' },
      narrative: narrative || job.generatedNarrative || { en: '', es: '', fr: '', zh: '', ja: '', ko: '' },
      coverUrl: job.generatedArtUrl,
      genre: genre || 'cinematic',
      bpm: bpm ? parseInt(bpm) : (job.audioMetadata as any)?.bpm || 110,
      mood: mood || (job.audioMetadata as any)?.mood || 'Cinematic',
      keySignature: keySignature || (job.audioMetadata as any)?.keySignature || 'D Minor',
      duration: (job.audioMetadata as any)?.duration || 180,
      isLive: true,
      updatedAt: new Date(),
    }).where(eq(tracks.id, job.trackId));

    await db.update(pipelineJobs).set({ status: 'complete', progress: 100 }).where(eq(pipelineJobs.id, jobId));
    broadcastJobStatus(jobId, 'complete', 100);

    return res.status(200).json({
      success: true,
      data: 'Track published successfully and is now LIVE',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Approval error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to approve and publish track',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/pipeline/regenerate/:jobId
router.post('/regenerate/:jobId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { field } = req.body; // 'art' or 'narrative'

    const job = await db.query.pipelineJobs.findFirst({
      where: eq(pipelineJobs.id, jobId),
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Pipeline job not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    // Simply simulate regeneration of field and return updated job
    await new Promise(r => setTimeout(r, 1000));

    if (field === 'art') {
      const generatedArtUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80';
      await db.update(pipelineJobs).set({ generatedArtUrl }).where(eq(pipelineJobs.id, jobId));
      broadcastJobStatus(jobId, 'awaiting_approval', 90, { generatedArtUrl });
    } else {
      const generatedNarrative = await translateText(
        `An intense and elegant gothic cinematic masterpiece with driving sub-basses, soaring violin lines, and rich orchestral string pads.`,
        'en'
      );
      await db.update(pipelineJobs).set({ generatedNarrative }).where(eq(pipelineJobs.id, jobId));
      broadcastJobStatus(jobId, 'awaiting_approval', 90, { generatedNarrative });
    }

    return res.status(200).json({
      success: true,
      data: 'Regeneration complete',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Regeneration failed:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Regeneration failed',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
