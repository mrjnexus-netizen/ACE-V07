import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
  };
}

export const getCookies = (req: Request): Record<string, string> => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);
};

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const cookies = getCookies(req);
  const token = cookies.accessToken || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Access token required',
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret_key_at_least_32_bytes_long';
    const decoded = jwt.verify(token, secret) as { id: string; username: string };
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      data: null,
      error: 'Invalid or expired access token',
      code: 'FORBIDDEN',
      timestamp: new Date().toISOString(),
    });
  }
};
