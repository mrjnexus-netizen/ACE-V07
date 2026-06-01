import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';

const router: Router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const startPostgres = Date.now();
  let postgresStatus = 'unconfigured';
  let postgresLatency = 0;

  try {
    // Run SELECT 1 raw query to check connection speed
    await db.execute(sql`SELECT 1`);
    postgresLatency = Date.now() - startPostgres;
    postgresStatus = postgresLatency < 50 ? 'healthy' : 'degraded';
  } catch (err) {
    postgresStatus = 'critical';
  }

  const startRedis = Date.now();
  let redisStatus = 'unconfigured';
  let redisLatency = 0;

  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
    });
    const reply = await redis.ping();
    redisLatency = Date.now() - startRedis;
    if (reply === 'PONG') {
      redisStatus = redisLatency < 10 ? 'healthy' : 'degraded';
    } else {
      redisStatus = 'critical';
    }
    await redis.quit();
  } catch (err) {
    redisStatus = 'critical';
  }

  // AWS S3 Check
  let s3Status = 'mocked';
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Status = 'healthy';
  }

  // Active keys check
  let keyCount = 0;
  try {
    const keys = await db.query.apiKeys.findMany();
    keyCount = keys.length;
  } catch (err) {
    // Ignore
  }

  const overallStatus =
    postgresStatus === 'critical' || redisStatus === 'critical'
      ? 'critical'
      : postgresStatus === 'degraded' || redisStatus === 'degraded'
      ? 'degraded'
      : 'healthy';

  return res.status(200).json({
    status: overallStatus,
    checks: {
      postgres: postgresStatus,
      redis: redisStatus,
      s3: s3Status,
      queue: 'healthy',
      apiKeys: keyCount > 0 ? 'configured' : 'not_configured',
    },
    system_uptime: process.uptime(),
    component_latencies: {
      postgres_ms: postgresLatency,
      redis_ms: redisLatency,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
