export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Mark as operational error
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation Error') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Authentication Error') {
    super(message, 401, 'AUTH_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not Found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too Many Requests') {
    super(message, 429, 'RATE_LIMITED');
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal Server Error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}
