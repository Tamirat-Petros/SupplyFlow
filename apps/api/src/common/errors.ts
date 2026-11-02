import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFoundHandler: ErrorRequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;
  if (error instanceof ZodError) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten(), requestId } });
  }
  if (error instanceof AppError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details, requestId } });
  }
  logger.error({ err: error, requestId, method: req.method, path: req.originalUrl }, 'Unhandled request error');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId } });
};

