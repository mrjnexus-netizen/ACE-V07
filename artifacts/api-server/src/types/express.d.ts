import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        id: string;
        username: string;
        role: string;
      };
    }
  }
}

export interface CustomJwtPayload extends JwtPayload {
  id: string;
  username: string;
  role: string;
}