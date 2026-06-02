import { Response } from "express";

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  code: string | null;
  timestamp: string;
}

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): void => {
  res.status(statusCode).json({
    success: true,
    data: data,
    error: null,
    code: null,
    timestamp: new Date().toISOString(),
  } as ApiResponse<T>);
};

export const sendError = (res: Response, error: string, code: string, statusCode: number): void => {
  res.status(statusCode).json({
    success: false,
    data: null,
    error: error,
    code: code,
    timestamp: new Date().toISOString(),
  } as ApiResponse<null>);
};
