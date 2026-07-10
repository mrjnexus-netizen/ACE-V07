import { Request, Response, NextFunction } from "express";
import { rateLimit, RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { redis } from "../db/redis";
import { AppError } from "../utils/errors";

const handler = (_req: Request, _res: Response, _next: NextFunction, _options: unknown): void => {
  throw new AppError("Rate limit exceeded", 429, "RATE_LIMITED");
};

// Redis-backed rate limiting matters in production (multiple server
// instances need a SHARED counter). In local dev there's only ever one
// instance, so the shared store buys nothing — but it DOES make every
// single request depend on Redis being perfectly healthy. A Redis blip
// (which a local/dev Redis is far more prone to than a managed prod one)
// was crashing the ENTIRE server via an unhandled rejection, taking down
// every open connection including the media pipeline's SSE stream
// (2026-07-09). In dev, use express-rate-limit's built-in in-memory store
// instead — same rate-limiting behavior, zero Redis dependency.
const isProduction = process.env.NODE_ENV === 'production';

const redisStore = (prefix: string) => new RedisStore({
  // @ts-expect-error - Known issue with RedisStore types
  sendCommand: (...args: string[]) => redis.call(...args),
  prefix,
});

export const globalRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: isProduction ? redisStore("rl:global:") : undefined,
});

export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: isProduction ? redisStore("rl:auth:") : undefined,
});