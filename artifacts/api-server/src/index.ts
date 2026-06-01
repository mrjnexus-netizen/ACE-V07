import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";
import dotenv from "dotenv";
import keysRoutes from "./routes/keys";
import authRoutes from "./routes/auth";
import identityRoutes from "./routes/identity";
import tracksRoutes from "./routes/tracks";
import briefsRoutes from "./routes/briefs";
import chatRoutes from "./routes/chat";
import mediaRoutes from "./routes/media";
import pipelineRoutes from "./routes/pipeline";
import documentsRoutes from "./routes/documents";
import healthRoutes from "./routes/health";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:18956";

// Redis client for rate limiting
const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redisClient.on("error", (err) => console.error("Redis Client Error", err));

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://s3.amazonaws.com"], // Adjust for S3 if needed
      connectSrc: ["'self'", FRONTEND_URL, "ws:", "wss:", "http://localhost:8080", "http://localhost:6379"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for SharedArrayBuffer in some contexts
}));

// CORS restricted to frontend origin
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Gzip compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging (development only)
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Rate limiting (100 req/min per IP)
const limiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(args[0]!, ...args.slice(1)) as Promise<any>,
    prefix: "rate-limit:",
  }),
  windowMs: 60 * 1000, // 1 minute
  limit: 100, // 100 requests per 1 minute (Express rate limit uses `limit` instead of `max` in newer typing versions or configs)
  message: "Too many requests from this IP, please try again after a minute",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

// Routes
app.use("/api/keys", keysRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/identity", identityRoutes);
app.use("/api/tracks", tracksRoutes);
app.use("/api/briefs", briefsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/health", healthRoutes);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    success: false,
    data: null,
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
    code: "SERVER_ERROR",
    timestamp: new Date().toISOString(),
  });
});

// Handle unhandled promise rejections and uncaught exceptions
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Optionally, you can gracefully shut down the server here
  // process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Optionally, you can gracefully shut down the server here
  // process.exit(1);
});

app.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
});
