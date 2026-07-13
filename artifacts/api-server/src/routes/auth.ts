import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm";
import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env";
import { db } from "../db/db";
import { adminUsers } from "../db/schema";
import { authGuard } from "../middleware/authGuard";
import { authRateLimiter } from "../middleware/rateLimiter";
import { sendVerificationCode, verifyPendingCode } from "../services/emailService";
import { encryptSecret, generateTwoFactorSetup, verifySetupCode, verifyStoredCode } from "../services/twoFactorService";
import { AuthError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";


const router: Router = Router();
const logger = createChildLogger("AuthRoutes");

const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24h
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30d
const PENDING_LOGIN_EXPIRY = 5 * 60 * 1000; // 5min — deliberately short, this cookie only proves "password was correct a moment ago", not a real session

const getJwtSecret = (): string => env.JWT_SECRET;

interface AdminUserRow {
  id: string;
  username: string;
}

interface PendingLoginState {
  id: string;
  username: string;
  pendingLogin: true;
  need2FA: boolean;
  needEmail: boolean;
  done2FA: boolean;
  doneEmail: boolean;
}

/** Issues the real access+refresh session cookies. The ONE place that
 * actually starts a session — called once every remaining pending factor
 * (2FA, email, or neither) has cleared, never duplicated per-factor. */
function issueSessionTokens(res: Response, admin: AdminUserRow): void {
  const secret = getJwtSecret();
  const accessToken = jwt.sign({ id: admin.id, username: admin.username, role: "admin" }, secret, {
    expiresIn: "24h",
  });
  const refreshToken = jwt.sign({ id: admin.id, username: admin.username, role: "admin" }, secret, {
    expiresIn: "30d",
  });
  const isProd = env.NODE_ENV === "production";

  res.cookie("accessToken", accessToken, {
    httpOnly: true, secure: isProd, sameSite: "strict", maxAge: ACCESS_TOKEN_EXPIRY,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, secure: isProd, sameSite: "strict", maxAge: REFRESH_TOKEN_EXPIRY,
  });
}

/** Re-issues the pending-login cookie with updated done2FA/doneEmail
 * flags — since a signed JWT can't be mutated in place, each verification
 * step (2FA, then email, in whichever order is still outstanding) gets a
 * fresh token carrying the updated state forward. */
function issuePendingLoginCookie(res: Response, state: Omit<PendingLoginState, "pendingLogin">): void {
  const secret = getJwtSecret();
  const pendingToken = jwt.sign({ ...state, pendingLogin: true }, secret, { expiresIn: "5m" });
  const isProd = env.NODE_ENV === "production";
  res.cookie("pendingLoginToken", pendingToken, {
    httpOnly: true, secure: isProd, sameSite: "strict", maxAge: PENDING_LOGIN_EXPIRY,
  });
}

/** After a factor clears, decides what's next: another factor (re-issues
 * the pending cookie and tells the frontend which step to show), or a
 * real session (every required factor is done). One place this branching
 * logic lives, called from both /2fa/login-verify and /email/login-verify. */
async function advanceOrFinishLogin(res: Response, state: PendingLoginState): Promise<void> {
  if (state.need2FA && !state.done2FA) {
    issuePendingLoginCookie(res, state);
    sendSuccess(res, { requires2FA: true }, 200);
    return;
  }
  if (state.needEmail && !state.doneEmail) {
    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, state.id) });
    if (admin?.email) await sendVerificationCode(state.id, admin.email, "login");
    issuePendingLoginCookie(res, state);
    sendSuccess(res, { requiresEmail: true }, 200);
    return;
  }
  res.clearCookie("pendingLoginToken");
  issueSessionTokens(res, { id: state.id, username: state.username });
  sendSuccess(res, { username: state.username }, 200);
}

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

    // Password correct. Reset failure count and update lastLogin either way.
    await db
      .update(adminUsers)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      })
      .where(eq(adminUsers.id, admin.id));

    const need2FA = admin.twoFactorEnabled;
    const needEmail = admin.emailVerificationRequired && admin.emailVerified;

    if (!need2FA && !needEmail) {
      issueSessionTokens(res, admin);
      logger.info({ requestId: req.id, username: admin.username }, "Admin user logged in successfully.");
      sendSuccess(res, { username: admin.username }, 200);
      return;
    }

    // At least one more factor is needed. 2FA is checked before email
    // when both are enabled — an arbitrary but fixed order, so
    // advanceOrFinishLogin's branching is deterministic either way.
    const state: PendingLoginState = { id: admin.id, username: admin.username, pendingLogin: true, need2FA, needEmail, done2FA: false, doneEmail: false };
    if (need2FA) {
      issuePendingLoginCookie(res, state);
      logger.info({ requestId: req.id, username: admin.username }, "Password correct, awaiting 2FA code.");
      sendSuccess(res, { requires2FA: true }, 200);
    } else {
      const sent = await sendVerificationCode(admin.id, admin.email!, "login");
      issuePendingLoginCookie(res, state);
      logger.info({ requestId: req.id, username: admin.username, emailSent: sent }, "Password correct, awaiting email code.");
      sendSuccess(res, { requiresEmail: true }, 200);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error); // Pass to global error handler
  }
});

function readPendingLoginState(req: Request): PendingLoginState | null {
  const token = req.cookies?.pendingLoginToken;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as PendingLoginState;
    return decoded.pendingLogin ? decoded : null;
  } catch {
    return null;
  }
}

// POST /api/auth/2fa/login-verify — checks the 6-digit TOTP code against
// the pending login state, then hands off to advanceOrFinishLogin for
// whatever's next (email verification, or a real session).
const verifyLoginCodeSchema = z.object({ code: z.string().min(6).max(6) });

router.post("/2fa/login-verify", authRateLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const state = readPendingLoginState(req);
    if (!state) {
      res.clearCookie("pendingLoginToken");
      sendError(res, "Login session expired — please sign in again.", "PENDING_LOGIN_EXPIRED", 401);
      return;
    }

    const { code } = verifyLoginCodeSchema.parse(req.body);

    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, state.id) });
    if (!admin || !admin.twoFactorEnabled || !admin.twoFactorSecret) {
      sendError(res, "2FA is not set up on this account.", "2FA_NOT_ENABLED", 400);
      return;
    }
    if (!verifyStoredCode(admin.twoFactorSecret, code)) {
      sendError(res, "Incorrect code.", "INVALID_2FA_CODE", 401);
      return;
    }

    logger.info({ requestId: req.id, username: admin.username }, "2FA code verified.");
    await advanceOrFinishLogin(res, { ...state, done2FA: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// POST /api/auth/email/login-verify — checks the 6-digit emailed code
// against the pending login state, then hands off to advanceOrFinishLogin.
router.post("/email/login-verify", authRateLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const state = readPendingLoginState(req);
    if (!state) {
      res.clearCookie("pendingLoginToken");
      sendError(res, "Login session expired — please sign in again.", "PENDING_LOGIN_EXPIRED", 401);
      return;
    }

    const { code } = verifyLoginCodeSchema.parse(req.body);
    const result = await verifyPendingCode(state.id, code);
    if (!result.ok) {
      sendError(res, "Incorrect or expired code.", "INVALID_EMAIL_CODE", 401);
      return;
    }

    logger.info({ requestId: req.id, username: state.username }, "Email code verified.");
    await advanceOrFinishLogin(res, { ...state, doneEmail: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// GET /api/auth/2fa/status — whether 2FA is currently enabled, for the
// Security tab to know what to render.
router.get("/2fa/status", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
    sendSuccess(res, { enabled: !!admin?.twoFactorEnabled }, 200);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/2fa/setup — generates a new secret + QR code. NOT
// persisted yet; the admin must scan it and confirm one real code via
// /2fa/verify-setup before it's actually enabled.
router.post("/2fa/setup", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const username = req.user?.username;
    if (!username) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const setup = await generateTwoFactorSetup(username);
    sendSuccess(res, setup, 200);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/2fa/verify-setup — confirms the admin actually scanned
// the QR and can produce a valid code, THEN persists the secret and flips
// twoFactorEnabled on.
const verifySetupSchema = z.object({ secret: z.string().min(1), code: z.string().min(6).max(6) });

router.post("/2fa/verify-setup", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const { secret, code } = verifySetupSchema.parse(req.body);

    if (!verifySetupCode(secret, code)) {
      sendError(res, "Incorrect code — check the app and try again.", "INVALID_2FA_CODE", 400);
      return;
    }

    await db
      .update(adminUsers)
      .set({ twoFactorSecret: encryptSecret(secret), twoFactorEnabled: true })
      .where(eq(adminUsers.id, userId));

    logger.info({ requestId: req.id, userId }, "2FA enabled.");
    sendSuccess(res, { enabled: true }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// POST /api/auth/2fa/disable — requires the current password again as
// confirmation, since turning OFF 2FA is a meaningful security downgrade.
const disable2FASchema = z.object({ password: z.string().min(1) });

router.post("/2fa/disable", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const { password } = disable2FASchema.parse(req.body);

    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
    if (!admin) {
      sendError(res, "Not found.", "NOT_FOUND", 404);
      return;
    }
    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      sendError(res, "Incorrect password.", "INVALID_CREDENTIALS", 401);
      return;
    }

    await db
      .update(adminUsers)
      .set({ twoFactorSecret: null, twoFactorEnabled: false })
      .where(eq(adminUsers.id, userId));

    logger.info({ requestId: req.id, userId }, "2FA disabled.");
    sendSuccess(res, { enabled: false }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// GET /api/auth/email/status — current email + verified + required flags,
// for the Security tab.
router.get("/email/status", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
    sendSuccess(res, {
      email: admin?.email ?? null,
      verified: !!admin?.emailVerified,
      required: !!admin?.emailVerificationRequired,
    }, 200);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/email/set — starts proving a new email address: sends a
// code to it. Doesn't touch `email`/`emailVerified` until /email/confirm
// succeeds — an unconfirmed address is never trusted or stored as live.
const setEmailSchema = z.object({ email: z.string().email() });

router.post("/email/set", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const { email } = setEmailSchema.parse(req.body);
    const sent = await sendVerificationCode(userId, email, "confirm");
    if (!sent) {
      sendError(res, "Email sending isn't configured yet — add SMTP credentials under Sources & Keys first.", "SMTP_NOT_CONFIGURED", 400);
      return;
    }
    logger.info({ requestId: req.id, userId }, "Email confirmation code sent.");
    sendSuccess(res, { sent: true }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// POST /api/auth/email/confirm — verifies the code sent by /email/set,
// and only then marks the address as the admin's live, verified email.
router.post("/email/confirm", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const { code } = verifyLoginCodeSchema.parse(req.body);
    const result = await verifyPendingCode(userId, code);
    if (!result.ok || !result.email) {
      sendError(res, "Incorrect or expired code.", "INVALID_EMAIL_CODE", 401);
      return;
    }

    await db
      .update(adminUsers)
      .set({ email: result.email, emailVerified: true })
      .where(eq(adminUsers.id, userId));

    logger.info({ requestId: req.id, userId }, "Email confirmed.");
    sendSuccess(res, { email: result.email, verified: true }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// PUT /api/auth/email/require — turns email verification on/off as a
// LOGIN factor. Can only be turned on once an email is actually verified.
const requireEmailSchema = z.object({ required: z.boolean() });

router.put("/email/require", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const { required } = requireEmailSchema.parse(req.body);

    if (required) {
      const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
      if (!admin?.emailVerified) {
        sendError(res, "Verify an email address first.", "EMAIL_NOT_VERIFIED", 400);
        return;
      }
    }

    await db.update(adminUsers).set({ emailVerificationRequired: required }).where(eq(adminUsers.id, userId));
    logger.info({ requestId: req.id, userId, required }, "Email verification requirement updated.");
    sendSuccess(res, { required }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
  }
});

// PUT /api/auth/change-password — requires the current password as
// confirmation, same principle as /2fa/disable: changing the password is
// meaningful enough to re-prove identity, not just rely on the existing
// session cookie already being valid.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

router.put("/change-password", authGuard, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, "Not authenticated.", "UNAUTHENTICATED", 401);
      return;
    }
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
    if (!admin) {
      sendError(res, "Not found.", "NOT_FOUND", 404);
      return;
    }
    const isMatch = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isMatch) {
      sendError(res, "Current password is incorrect.", "INVALID_CREDENTIALS", 401);
      return;
    }
    if (currentPassword === newPassword) {
      sendError(res, "New password must be different from the current one.", "VALIDATION_ERROR", 400);
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(adminUsers).set({ passwordHash: newHash }).where(eq(adminUsers.id, userId));

    logger.info({ requestId: req.id, userId }, "Password changed.");
    sendSuccess(res, { changed: true }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(res, error.errors?.[0]?.message || "Validation error", "VALIDATION_ERROR", 400);
      return;
    }
    next(error);
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
  res.clearCookie("pendingLoginToken");
  logger.info({ requestId: req.id }, "Admin user logged out successfully.");
  return sendSuccess(res, "Logged out successfully", 200);
});

export default router;
