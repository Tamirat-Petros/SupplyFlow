import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors.js';
import { verifyAccessToken } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
    (req as AuthenticatedRequest).auth = verifyAccessToken(header.slice(7));
    next();
  } catch (error) { next(error); }
};

export const requirePermission = (...permissions: string[]): RequestHandler => (req, _res, next) => {
  const context = (req as AuthenticatedRequest).auth;
  if (!context) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required'));
  if (!permissions.every((permission) => context.permissions.includes(permission))) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission for this operation'));
  }
  next();
};
