import { Request, Response, NextFunction } from "express";

import { env } from "../config/env";
import { AppError, InternalError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";

const logger = createChildLogger("ErrorMiddleware");

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let error = err; // Use let to reassign error if it's not an AppError

  // Check if the error is an operational error (AppError instance)
  if (!(error instanceof AppError)) {
    // For non-operational errors, wrap them in a generic InternalError
    error = new InternalError(error.message);
  }

  const isDevelopment = env.NODE_ENV === "development";

  const statusCode = (error as AppError).statusCode || 500;
  const code = (error as AppError).code || "INTERNAL_ERROR";
  const message = error.message || "Something went wrong";

  // Log the error (without stack trace in production)
  logger.error(
    { requestId: req.id, statusCode, code, message, stack: isDevelopment ? error.stack : undefined },
    "Error caught by global error handler"
  );

  res.status(statusCode).json({
    success: false,
    data: null,
    error: message,
    code: code,
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: error.stack }), // Only include stack in development
  });
};
