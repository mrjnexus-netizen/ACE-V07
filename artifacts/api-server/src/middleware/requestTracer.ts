import { randomUUID } from 'node:crypto';

import { Request, Response, NextFunction } from 'express';

import { createChildLogger } from "../utils/logger";

// Extend the Express Request interface to include the `id` property
declare module 'express' {
  interface Request {
    id: string;
  }
}

const logger = createChildLogger("RequestTracer");

export const requestTracer = (req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);

  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info({ requestId: req.id, method: req.method, path: req.path, ip: clientIp }, 'Incoming request');

  next();
};
