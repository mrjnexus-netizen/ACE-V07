import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import Redis from 'ioredis';
import { sql, eq } from 'drizzle-orm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Queue, ConnectionOptions } from 'bullmq';
import { env } from '../config/env';
import { createChildLogger } from '../utils/logger';
import { apiKeys } from '../db/schema'; // Import apiKeys schema

const router: Router = Router();
const logger = createChildLogger("HealthRoutes");

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const redisUrl = new URL(env.REDIS_URL);
const connectionOptions: ConnectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379'),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
};

const pipelineQueue = new Queue('pipelineQueue', {
  connection: connectionOptions,
});

router.get('/', async (_req: Request, res: Response) => {
  const checks: { [key: string]: boolean } = {};
  const component_latencies: { [key: string]: number } = {};

  const [postgresCheck, redisCheck, s3Check, bullMQCheck, apiKeysCheck] = await Promise.allSettled([
    (async () => {
      const startPostgres = Date.now();
      try {
        await db.execute(sql`SELECT 1`);
        const latency = Date.now() - startPostgres;
        component_latencies.postgres_ms = latency;
        return latency < 50;
      } catch (err) {
        logger.error("PostgreSQL health check failed:", err);
        return false;
      }
    })(),
    (async () => {
      const startRedis = Date.now();
      const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
      try {
        const reply = await redis.ping();
        const latency = Date.now() - startRedis;
        component_latencies.redis_ms = latency;
        return reply === 'PONG' && latency < 10;
      } catch (err) {
        logger.error("Redis health check failed:", err);
        return false;
      } finally {
        await redis.quit();
      }
    })(),
    (async () => {
      try {
        await s3Client.send(new HeadBucketCommand({ Bucket: env.AWS_S3_BUCKET_NAME }));
        return true;
      } catch (err) {
        logger.error("AWS S3 health check failed:", err);
        return false;
      }
    })(),
    (async () => {
      try {
        await pipelineQueue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
        return true;
      } catch (err) {
        logger.error("BullMQ health check failed:", err);
        return false;
      }
    })(),
    (async () => {
      try {
        const activeKeys = await db.query.apiKeys.findMany({ where: eq(apiKeys.isActive, true) });
        return activeKeys.length > 0;
      } catch (err) {
        logger.error("API Keys health check failed:", err);
        return false;
      }
    })(),
  ]);

  checks.postgres = postgresCheck.status === 'fulfilled' ? postgresCheck.value : false;
  checks.redis = redisCheck.status === 'fulfilled' ? redisCheck.value : false;
  checks.s3 = s3Check.status === 'fulfilled' ? s3Check.value : false;
  checks.queue = bullMQCheck.status === 'fulfilled' ? bullMQCheck.value : false;
  checks.apiKeys = apiKeysCheck.status === 'fulfilled' ? apiKeysCheck.value : false;

  let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  const failedChecks = Object.values(checks).filter(status => !status).length;

  if (failedChecks >= 3) {
    overallStatus = 'critical';
  } else if (failedChecks >= 1) {
    overallStatus = 'degraded';
  }

  return res.status(200).json({
    status: overallStatus,
    checks: {
      postgres: checks.postgres,
      redis: checks.redis,
      s3: checks.s3,
      queue: checks.queue,
      apiKeys: checks.apiKeys ? 'configured' : 'not_configured',
    },
    system_uptime: process.uptime(),
    component_latencies: {
      postgres_ms: component_latencies.postgres_ms || 0,
      redis_ms: component_latencies.redis_ms || 0,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
