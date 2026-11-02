import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { authenticate } from './auth.middleware.js';
import { refreshSession, signIn, signOut } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';

const credentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try { const body = credentialsSchema.parse(req.body); res.json({ data: await signIn(body.email, body.password) }); } catch (error) { next(error); }
});

authRouter.post('/refresh', async (req, res, next) => {
  try { const body = refreshSchema.parse(req.body); res.json({ data: await refreshSession(body.refreshToken) }); } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try { const body = refreshSchema.parse(req.body); await signOut(body.refreshToken); res.status(204).send(); } catch (error) { next(error); }
});

authRouter.get('/me', authenticate, (req, res, next) => {
  const context = (req as AuthenticatedRequest).auth;
  if (!context) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required'));
  res.json({ data: context });
});
