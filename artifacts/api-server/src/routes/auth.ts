import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db/db';
import { adminUsers } from '../db/schema';
import { getCookies } from '../middleware/auth';

const router: Router = Router();

const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24h
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30d

const getJwtSecret = () => process.env.JWT_SECRET || 'fallback_secret_key_at_least_32_bytes_long';

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS',
        timestamp: new Date().toISOString(),
      });
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.username, username),
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        timestamp: new Date().toISOString(),
      });
    }

    // Check lockout state
    if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(admin.lockedUntil).getTime() - Date.now()) / (60 * 1000)
      );
      return res.status(403).json({
        success: false,
        data: null,
        error: `Account is locked. Please try again in ${remainingMinutes} minutes.`,
        code: 'LOCKED_OUT',
        timestamp: new Date().toISOString(),
      });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);

    if (!isMatch) {
      const currentFailures = (admin.failedAttempts || 0) + 1;
      let lockedUntil: Date | null = null;

      if (currentFailures >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lockout
      }

      await db
        .update(adminUsers)
        .set({
          failedAttempts: currentFailures >= 5 ? 0 : currentFailures, // Reset after lock sets or keep track
          lockedUntil,
        })
        .where(eq(adminUsers.id, admin.id));

      const errorMsg = currentFailures >= 5
        ? 'Too many failed attempts. Account locked for 15 minutes.'
        : `Invalid credentials. ${5 - currentFailures} attempts remaining.`;

      return res.status(401).json({
        success: false,
        data: null,
        error: errorMsg,
        code: currentFailures >= 5 ? 'LOCKED_OUT' : 'INVALID_CREDENTIALS',
        timestamp: new Date().toISOString(),
      });
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
    const accessToken = jwt.sign({ id: admin.id, username: admin.username }, secret, {
      expiresIn: '24h',
    });
    const refreshToken = jwt.sign({ id: admin.id, username: admin.username }, secret, {
      expiresIn: '30d',
    });

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_EXPIRY,
    });

    return res.status(200).json({
      success: true,
      data: {
        id: admin.id,
        username: admin.username,
        accessToken,
      },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'An internal server error occurred',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const cookies = getCookies(req);
    const refreshToken = cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_REQUIRED',
        timestamp: new Date().toISOString(),
      });
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(refreshToken, secret) as { id: string; username: string };

    const accessToken = jwt.sign({ id: decoded.id, username: decoded.username }, secret, {
      expiresIn: '24h',
    });

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: ACCESS_TOKEN_EXPIRY,
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
      },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      data: null,
      error: 'Invalid or expired refresh token',
      code: 'FORBIDDEN',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  return res.status(200).json({
    success: true,
    data: 'Logged out successfully',
    error: null,
    code: null,
    timestamp: new Date().toISOString(),
  });
});

export default router;
