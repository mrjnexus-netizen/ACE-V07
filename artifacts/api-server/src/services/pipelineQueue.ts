import { Queue, Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';

import { db } from '../db/db';
import { redis } from '../db/redis';
import { pipelineJobs } from '../db/schema';

const connection = redis;

export const queue = new Queue('ace-pipeline', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export async function addPipelineJob(jobData: Record<string, unknown>): Promise<Job> {
  return await queue.add('process-pipeline', jobData);
}

export async function getJobStatus(jobId: string): Promise<{ id: string; progress: number; state: string; data: unknown } | null> {
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const state: string = (await job.getState()) ?? '';
  const progress: number = typeof job.progress === 'number' ? job.progress : 0;
  return { id: job.id!, progress, state: state as string, data: job.data };
}

export const worker = new Worker(
  'ace-pipeline',
  async (job: Job): Promise<void> => {
    const { trackId: _trackId, jobId } = job.data as { trackId: string; jobId: string };

    try {
      const updateProgress = async (prog: number): Promise<void> => {
        await job.updateProgress(prog);
        await db
          .update(pipelineJobs)
          .set({ progress: prog })
          .where(eq(pipelineJobs.id, jobId));
      };

      await updateProgress(10);

      const analysisPromise = async (): Promise<{ dominantInstrument: string; bpm: number; mood: string; keySignature: string; duration: number }> => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { dominantInstrument: 'Piano', bpm: 120, mood: 'Peaceful', keySignature: 'C Major', duration: 150 };
      };

      const artPromise = async (): Promise<{ generatedArtUrl: string }> => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { generatedArtUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745' };
      };

      const narrativePromise = async (): Promise<{ generatedNarrative: { en: string } }> => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return { generatedNarrative: { en: 'A peaceful, serene piano composition.' } };
      };

      await updateProgress(30);

      const results = await Promise.allSettled([analysisPromise(), artPromise(), narrativePromise()]);

      await updateProgress(80);

      const audioAnalysisResult = results[0].status === 'fulfilled' ? results[0].value : null;
      const artResult = results[1].status === 'fulfilled' ? results[1].value : null;
      const narrativeResult = results[2].status === 'fulfilled' ? results[2].value : null;

      await db
        .update(pipelineJobs)
        .set({
          status: 'awaiting_approval',
          progress: 100,
          audioMetadata: audioAnalysisResult,
          generatedArtUrl: artResult?.generatedArtUrl || null,
          generatedNarrative: narrativeResult?.generatedNarrative || null,
        })
        .where(eq(pipelineJobs.id, jobId));

    } catch (err: unknown) {
      console.error(`Pipeline job ${job.id} failed:`, err);
      await db
        .update(pipelineJobs)
        .set({
          status: 'error',
          errorMessage: (err as Error).message || 'Unknown processing error',
        })
        .where(eq(pipelineJobs.id, jobId));
      throw err;
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

const shutdown = async (): Promise<void> => {
  console.warn('Shutting down BullMQ queue and workers gracefully...');
  await queue.close();
  await worker.close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);