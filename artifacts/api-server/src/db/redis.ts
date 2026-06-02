import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000); // Exponential backoff, max 2 seconds
    return delay;
  },
});

redis.on('connect', () => {
  console.log('Redis connected successfully.');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
  // In a real application, you might want to push this to a centralized logging service
  // but we must not crash the main process.
});

// Verify connection on startup
async function verifyRedisConnection() {
  try {
    const start = Date.now();
    await redis.ping();
    const end = Date.now();
    const latency = end - start;
    if (latency < 10) {
      console.log(`Redis PING successful. Latency: ${latency}ms`);
    } else {
      console.warn(`Redis PING successful but latency is high: ${latency}ms`);
    }
  } catch (error) {
    console.error('Redis connection verification failed:', error);
    throw new Error('Redis connection verification failed');
  }
}

// Call verification on startup
verifyRedisConnection();
