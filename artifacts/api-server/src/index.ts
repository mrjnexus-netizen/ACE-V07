import compression from "compression";
import cookieParser from "cookie-parser";
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
import chatLogsRoutes from "./routes/chatLogs";
import chatRoutes from "./routes/chat";
import contentRoutes from "./routes/content";
import documentsRoutes from "./routes/documents";
import healthRoutes from "./routes/health";
import identityRoutes from "./routes/identity";
import keysRoutes from "./routes/keys";
import mediaRoutes from "./routes/media";
import pipelineRoutes from "./routes/pipeline";
import modelDiscoveryRoutes from "./routes/modelDiscoveryRoutes";
import posterStudioRoutes from "./routes/posterStudioRoutes";
import positionsRoutes from "./routes/positionsRoutes";
import seoAuditRoutes from "./routes/seoAudit";
import siteIdentityRoutes from "./routes/siteIdentity";
import { initScheduler } from "./services/positionScanner/scheduler";
import { startModelDiscoverySchedule } from "./services/modelDiscovery";
import { hydrateModelOverrides } from "./services/aiProviders";
import tracksRoutes from "./routes/tracks";
import translateRoutes from "./routes/translate";
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

// SSE routes (Server-Sent Events, e.g. the pipeline progress stream) must
// NEVER be gzip-compressed: compression buffers small/sparse writes and can
// hold them indefinitely instead of flushing to the client, which looks
// exactly like a frontend progress bar that "freezes" forever even though
// the server is broadcasting correctly. Every current and future SSE
// endpoint should live under a path this filter recognizes.
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith("/api/pipeline/status")) return false;
      return compression.filter(req, res);
    },
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(globalRateLimiter);

// Route mounts
app.use("/api/auth", authRoutes);
app.use("/api/identity", identityRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/tracks", tracksRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/model-updates", modelDiscoveryRoutes);
app.use("/api/poster-studio", posterStudioRoutes);
app.use("/api/positions", positionsRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/briefs", briefsRoutes);
app.use("/api/chat-logs", chatLogsRoutes);
app.use("/api/keys", keysRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/seo", seoAuditRoutes);
app.use("/api/site-identity", siteIdentityRoutes);
app.use("/api/health", healthRoutes);

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Handle unhandled promise rejections and uncaught exceptions
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  logger.error({ reason, promise }, "Unhandled Rejection caught");
  // A transient dependency hiccup (Redis dropping a connection, hitting its
  // retry ceiling, etc.) should never take the ENTIRE server down — that
  // previously killed every in-flight request and open SSE connection
  // (including the media pipeline's progress stream) the instant Redis
  // blipped, with no way to recover short of a manual restart (2026-07-09).
  // Only exit for errors that don't look like a known-recoverable
  // dependency issue; log and keep serving for everything else.
  const message = reason instanceof Error ? reason.message : String(reason);
  const looksLikeTransientDependencyIssue = /redis|ECONNRESET|ECONNREFUSED|ETIMEDOUT|MaxRetriesPerRequest/i.test(message);
  if (looksLikeTransientDependencyIssue) {
    logger.warn({ message }, "Unhandled rejection looks like a transient dependency issue — NOT exiting, server stays up.");
    return;
  }
  // Application should ideally restart here in a controlled environment (e.g., PM2, Kubernetes)
  // For now, we will exit to ensure the process doesn\'t continue in a bad state.
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  logger.fatal({ error }, "Uncaught Exception caught");
  // For now, we will exit to ensure the process doesn\'t continue in a bad state.
  process.exit(1);
});

// 2026-07-10 fix: replay any previously-"Applied" model overrides from the
// DB into the in-memory provider registry BEFORE the server starts
// accepting requests — otherwise a model an admin already applied would
// silently vanish from the dropdown on every restart. hydrateModelOverrides()
// never throws (degrades to the base registry + a warning log on failure),
// so this can't block boot. Wrapped in an IIFE rather than a top-level
// await for CJS/ESM compatibility either way this project is compiled.
let server: ReturnType<typeof app.listen>;
void (async () => {
  await hydrateModelOverrides();
  await initScheduler(); // Business Scanner — replays the persisted on/off toggle so a restart doesn't silently reset it (or leave the DB saying "on" with no cron task actually running)
  server = app.listen(PORT, () => {
    logger.info(`API Server running on port ${PORT}`);
    // Periodic check for new AI provider models (2026-07-09) — the first
    // check runs 30s after boot, then every 24h. See services/modelDiscovery.ts.
    startModelDiscoverySchedule();
  });
})();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  // server is assigned inside the boot IIFE above (after hydration
  // completes); guard the extremely unlikely case SIGTERM arrives before
  // that finishes, so shutdown still cleans up instead of throwing.
  if (!server) {
    await pool.end();
    await redis.quit();
    process.exit(0);
    return;
  }
  server.close(async () => {
    logger.info("HTTP server closed.");
    await pool.end(); // Close PostgreSQL pool
    logger.info("PostgreSQL pool closed.");
    await redis.quit(); // Close Redis connection
    logger.info("Redis client disconnected.");
    process.exit(0);
  });
});