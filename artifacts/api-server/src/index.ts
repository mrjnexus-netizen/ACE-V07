import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { pool } from "./db/db"; // For graceful shutdown
import { redis } from "./db/redis"; // For graceful shutdown
import { errorMiddleware } from "./middleware/errorMiddleware";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { requestTracer } from "./middleware/requestTracer";

// Import routes
import authRoutes from "./routes/auth";
import briefsRoutes from "./routes/briefs";
import chatRoutes from "./routes/chat";
import documentsRoutes from "./routes/documents";
import healthRoutes from "./routes/health";
import identityRoutes from "./routes/identity";
import keysRoutes from "./routes/keys";
import mediaRoutes from "./routes/media";
import pipelineRoutes from "./routes/pipeline";
import tracksRoutes from "./routes/tracks";
import { createChildLogger } from "./utils/logger";

const app = express();
const PORT = 8080; // API server port is 8080 as per Blueprint
const logger = createChildLogger("Index");

// Middleware order is crucial
app.use(requestTracer);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://s3.amazonaws.com"], // Adjust for S3 if needed
      connectSrc: ["'self'", env.FRONTEND_URL, "ws:", "wss:", "http://localhost:8080", "http://localhost:6379"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(globalRateLimiter);

// Route mounts
app.use("/api/auth", authRoutes);
app.use("/api/identity", identityRoutes);
app.use("/api/tracks", tracksRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/briefs", briefsRoutes);
app.use("/api/keys", keysRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/health", healthRoutes);

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Handle unhandled promise rejections and uncaught exceptions
process.on("unhandledRejection", (reason: Error | any, promise: Promise<any>) => {
  logger.error({ reason, promise }, "Unhandled Rejection caught");
  // Application should ideally restart here in a controlled environment (e.g., PM2, Kubernetes)
  // For now, we will exit to ensure the process doesn\'t continue in a bad state.
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  logger.fatal({ error }, "Uncaught Exception caught");
  // For now, we will exit to ensure the process doesn\'t continue in a bad state.
  process.exit(1);
});

const server = app.listen(PORT, () => {
  logger.info(`API Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  server.close(async () => {
    logger.info("HTTP server closed.");
    await pool.end(); // Close PostgreSQL pool
    logger.info("PostgreSQL pool closed.");
    await redis.quit(); // Close Redis connection
    logger.info("Redis client disconnected.");
    process.exit(0);
  });
});
