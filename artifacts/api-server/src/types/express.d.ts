import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      id: string; // injected by requestTracer
      user?: { id: string, username: string, role: string }; // injected by authGuard
    }
  }
}

export interface CustomJwtPayload extends JwtPayload {
  id: string;
  username: string;
  role: string;
}
