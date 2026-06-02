import { rateLimit, RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../db/redis";
import { AppError } from "../utils/errors";
import { Request, Response, NextFunction } from "express";

const baseConfig = {
  windowMs: 60 * 1000, // 1 minute
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: new RedisStore({
    // @ts-expect-error - Known issue with RedisStore types
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  handler: (_req: Request, _res: Response, _next: NextFunction, _options: any) => {
    throw new AppError("Rate limit exceeded", 429, "RATE_LIMITED");
  },
};

export const globalRateLimiter: RateLimitRequestHandler = rateLimit({
  ...baseConfig,
  max: 100, // Limit each IP to 100 requests per `window` (here, per 1 minute)
});

export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per 15 minutes
});
