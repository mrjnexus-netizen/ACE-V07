import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env";
import { db } from "../db/db";
import { adminUsers } from "../db/schema";
import { authRateLimiter } from "../middleware/rateLimiter";
import { AuthError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";


const router: Router = Router();
const logger = createChildLogger("AuthRoutes");

const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24h
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30d

const getJwtSecret = (): string => env.JWT_SECRET;

// Zod schema for login validation
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// POST /api/auth/login
router.post("/login", authRateLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.username, username),
    });

    if (!admin) {
      sendError(res, "Invalid credentials", "INVALID_CREDENTIALS", 401);
      return;
    }

    // Check lockout state
    if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(admin.lockedUntil).getTime() - Date.now()) / (60 * 1000)
      );
      sendError(res, `Account is locked. Please try again in ${remainingMinutes} minutes.`, "LOCKED_OUT", 403);
      return;
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);

    if (!isMatch) {
      const currentFailures = (admin.failedAttempts || 0) + 1;
      let lockedUntil: Date | null = null;

      if (currentFailures >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lockout
        logger.warn({ requestId: req.id, username }, "Account locked due to too many failed login attempts.");
      }

      await db
        .update(adminUsers)
        .set({
          failedAttempts: currentFailures,
          lockedUntil,
        })
        .where(eq(adminUsers.id, admin.id));

      const errorMsg = currentFailures >= 5
        ? "Too many failed attempts. Account locked for 15 minutes."
        : `Invalid credentials. ${5 - currentFailures} attempts remaining.`;

      sendError(res, errorMsg, currentFailures >= 5 ? "LOCKED_OUT" : "INVALID_CREDENTIALS", 401);
      return;
    }

    // Success! Reset failure count and update lastLogin
    await db
      .update(adminUsers)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      })
      .where(eq(adminUsers.id, admin.id));

    const secret = getJwtSecret();
    const accessToken = jwt.sign({ id: admin.id, username: admin.username, role: "admin" }, secret, {
      expiresIn: "24h",
    });
    const refreshToken = jwt.sign({ id: admin.id, username: admin.username, role: "admin" }, secret, {
      expiresIn: "30d",
    });

    const isProd = env.NODE_ENV === "production";

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: REFRESH_TOKEN_EXPIRY,
    });

    logger.info({ requestId: req.id, username: admin.username }, "Admin user logged in successfully.");
    sendSuccess(res, { username: admin.username }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error); // Pass to global error handler
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new AuthError("Refresh token required");
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(refreshToken, secret) as { id: string; username: string, role: string };

    const newAccessToken = jwt.sign({ id: decoded.id, username: decoded.username, role: decoded.role }, secret, {
      expiresIn: "24h",
    });

    const isProd = env.NODE_ENV === "production";

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    logger.info({ requestId: req.id, username: decoded.username }, "Access token refreshed.");
    return sendSuccess(res, { username: decoded.username }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return sendError(res, error.message, error.code, error.statusCode);
    }
    // If JWT verification fails, it will throw an error
    logger.error({ requestId: req.id, error }, "Refresh token validation failed.");
    return sendError(res, "Invalid or expired refresh token", "FORBIDDEN", 403);
  }
});

// POST /api/auth/logout
router.post("/logout", async (req: Request, res: Response) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  logger.info({ requestId: req.id }, "Admin user logged out successfully.");
  return sendSuccess(res, "Logged out successfully", 200);
});

export default router;
