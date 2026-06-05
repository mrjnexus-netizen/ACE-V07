import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../db/redis';
import { db } from '../db/db';
import { pipelineJobs } from '../db/schema';
import { eq } from 'drizzle-orm';

// Redis connection share
const connection = redis;

// 1. Create the Queue named 'ace-pipeline'
export const queue = new Queue('ace-pipeline', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s backoff per AI Resilience
    },
  },
});

// Helper functions required for export
export async function addPipelineJob(jobData: any) {
  return await queue.add('process-pipeline', jobData);
}

export async function getJobStatus(jobId: string) {
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const counts = await job.getState();
  return { id: job.id, progress: job.progress, state: counts, data: job.data };
}

// 2. Define Worker with Concurrency of 2
export const worker = new Worker(
  'ace-pipeline',
  async (job: Job) => {
    const { trackId: _trackId, jobId } = job.data;

    try {
      // Step progress update helper
      const updateProgress = async (prog: number) => {
        await job.updateProgress(prog);
        await db
          .update(pipelineJobs)
          .set({ progress: prog })
          .where(eq(pipelineJobs.id, jobId));
      };

      await updateProgress(10);

      // Concurrently execute pipeline stages safely via Promise.allSettled
      const analysisPromise = async () => {
        // Mock audio analysis step
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { dominantInstrument: 'Piano', bpm: 120, mood: 'Peaceful', keySignature: 'C Major', duration: 150 };
      };

      const artPromise = async () => {
        // Mock art generation step
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { generatedArtUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745' };
      };

      const narrativePromise = async () => {
        // Mock narrative generation step
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return { generatedNarrative: { en: 'A peaceful, serene piano composition.' } };
      };

      await updateProgress(30);

      const results = await Promise.allSettled([analysisPromise(), artPromise(), narrativePromise()]);

      await updateProgress(80);

      const audioAnalysisResult = results[0].status === 'fulfilled' ? results[0].value : null;
      const artResult = results[1].status === 'fulfilled' ? results[1].value : null;
      const narrativeResult = results[2].status === 'fulfilled' ? results[2].value : null;

      // Update database with success
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

    } catch (error: any) {
      console.error(`Pipeline job ${job.id} failed:`, error);
      await db
        .update(pipelineJobs)
        .set({
          status: 'error',
          errorMessage: error.message || 'Unknown processing error',
        })
        .where(eq(pipelineJobs.id, jobId));
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

// 3. Graceful Shutdown handlers
const shutdown = async () => {
  console.log('Shutting down BullMQ queue and workers gracefully...');
  await queue.close();
  await worker.close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
