import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { CustomJwtPayload } from "../types/express";
import { AuthError, ForbiddenError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";

const logger = createChildLogger("AuthGuard");

const ACCESS_TOKEN_EXPIRY = "24h";
const REFRESH_TOKEN_EXPIRY = "30d";

export const authGuard = (req: Request, res: Response, next: NextFunction): void => {
  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;
  const secret = env.JWT_SECRET;

  if (!accessToken && !refreshToken) {
    logger.warn({ requestId: req.id }, "Auth failure: No tokens provided.");
    next(new AuthError("Authentication required."));
    return;
  }

  try {
    const decoded = jwt.verify(accessToken as string, secret) as unknown as CustomJwtPayload;
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    next();
  } catch (accessError) {
    if (accessError instanceof jwt.TokenExpiredError && refreshToken) {
      try {
        const decodedRefresh = jwt.verify(refreshToken, secret) as CustomJwtPayload;

        const newAccessToken = jwt.sign(
          { id: decodedRefresh.id, username: decodedRefresh.username, role: decodedRefresh.role },
          secret,
          { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        const newRefreshToken = jwt.sign(
          { id: decodedRefresh.id, username: decodedRefresh.username, role: decodedRefresh.role },
          secret,
          { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        const isProd = env.NODE_ENV === "production";

        res.cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000,
        });

        res.cookie("refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        req.user = { id: decodedRefresh.id, username: decodedRefresh.username, role: decodedRefresh.role };
        logger.info({ requestId: req.id, username: decodedRefresh.username }, "Access token refreshed via refresh token.");
        next();
      } catch (_refreshError) {
        logger.warn({ requestId: req.id, authFailure: "refresh_token_invalid" }, "Auth failure: Invalid or expired refresh token.");
        next(new ForbiddenError("Invalid or expired refresh token. Please log in again."));
      }
    } else {
      logger.warn({ requestId: req.id, authFailure: "access_token_invalid" }, "Auth failure: Invalid access token.");
      next(new AuthError("Invalid access token. Please log in again."));
    }
  }
};

export { authGuard as authenticateJWT };