import { Request, Response, NextFunction, RequestHandler } from "express";
import { ForbiddenError } from "../utils/errors";
import { createChildLogger } from "../utils/logger";

const logger = createChildLogger("RoleGuard");

export const requireRole = (requiredRole: "admin" | "composer"): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn({ requestId: req.id }, "Role guard: req.user not found. Ensure authGuard is applied first.");
      return next(new ForbiddenError("User authentication data missing."));
    }

    if (req.user.role !== requiredRole) {
      logger.warn({ requestId: req.id, userId: req.user.id, userRole: req.user.role, requiredRole }, "Role guard: Access denied due to insufficient role.");
      return next(new ForbiddenError("Access denied: Insufficient privileges."));
    }

    next();
  };
};
