import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthContext } from './auth.types.js';

const ACCESS_TOKEN_LIFETIME = '15m';
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type JwtClaims = AuthContext & { jti?: string };

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function buildContext(userId: string): Promise<AuthContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      warehouses: { select: { warehouseId: true } },
    },
  });
  if (!user || user.status !== 'ACTIVE') throw new AppError(401, 'UNAUTHENTICATED', 'Invalid account');
  return {
    userId: user.id,
    email: user.email,
    permissions: [...new Set(user.roles.flatMap((link) => link.role.permissions.map((grant) => grant.permission.code)))],
    warehouseIds: user.warehouses.map((scope) => scope.warehouseId),
  };
}

function signAccessToken(context: AuthContext) {
  return jwt.sign(context, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_LIFETIME, subject: context.userId });
}

async function issueTokens(context: AuthContext) {
  const tokenId = randomUUID();
  const refreshToken = jwt.sign({ sub: context.userId, jti: tokenId }, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);
  await prisma.refreshToken.create({ data: { id: tokenId, userId: context.userId, tokenHash: hashToken(refreshToken), expiresAt } });
  return { accessToken: signAccessToken(context), refreshToken, expiresAt: expiresAt.toISOString(), user: context };
}

export async function signIn(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  return issueTokens(await buildContext(user.id));
}

export async function refreshSession(refreshToken: string) {
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }
  if (typeof claims.sub !== 'string' || typeof claims.jti !== 'string') throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid');
  const stored = await prisma.refreshToken.findUnique({ where: { id: claims.jti } });
  if (!stored || stored.userId !== claims.sub || stored.revokedAt || stored.expiresAt <= new Date() || stored.tokenHash !== hashToken(refreshToken)) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked');
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokens(await buildContext(claims.sub));
}

export async function signOut(refreshToken: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtClaims;
    if (typeof claims.userId !== 'string' || !Array.isArray(claims.permissions) || !Array.isArray(claims.warehouseIds)) throw new Error('Malformed claims');
    return { userId: claims.userId, email: claims.email, permissions: claims.permissions, warehouseIds: claims.warehouseIds };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }
}
