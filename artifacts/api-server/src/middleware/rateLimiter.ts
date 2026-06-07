import { Request, Response, NextFunction } from "express";
import { rateLimit, RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { redis } from "../db/redis";
import { AppError } from "../utils/errors";

const handler = (_req: Request, _res: Response, _next: NextFunction, _options: unknown): void => {
  throw new AppError("Rate limit exceeded", 429, "RATE_LIMITED");
};

export const globalRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: new RedisStore({
    // @ts-expect-error - Known issue with RedisStore types
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: "rl:global:", // پیشوند اختصاصی برای جلوگیری از تداخل
  }),
});

export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  store: new RedisStore({
    // @ts-expect-error - Known issue with RedisStore types
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: "rl:auth:", // پیشوند اختصاصی برای جلوگیری از تداخل
  }),
});