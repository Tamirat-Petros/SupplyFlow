import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../auth/auth.middleware.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';

const userIdSchema = z.string().uuid();
const createUserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(120),
  roleIds: z.array(z.string().uuid()).min(1),
  warehouseIds: z.array(z.string().uuid()).default([]),
});
const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  roleIds: z.array(z.string().uuid()).min(1).optional(),
  warehouseIds: z.array(z.string().uuid()).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const usersRouter = Router();
usersRouter.use(authenticate, requirePermission('users.manage'));

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, displayName: true, status: true, createdAt: true, roles: { select: { role: { select: { id: true, name: true } } } }, warehouses: { select: { warehouseId: true } } },
    });
    res.json({ data: users });
  } catch (error) { next(error); }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const actor = (req as AuthenticatedRequest).auth!;
    const email = body.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'A user with this email already exists');
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email, displayName: body.displayName, passwordHash: await bcrypt.hash(body.password, 12),
          roles: { createMany: { data: body.roleIds.map((roleId) => ({ roleId })) } },
          warehouses: { createMany: { data: body.warehouseIds.map((warehouseId) => ({ warehouseId })) } },
        },
        select: { id: true, email: true, displayName: true, status: true },
      });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'USER_CREATED', entityType: 'USER', entityId: created.id, requestId: res.locals.requestId, after: { email: created.email, roleIds: body.roleIds } } });
      return created;
    });
    res.status(201).json({ data: user });
  } catch (error) { next(error); }
});

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = userIdSchema.parse(req.params.id);
    const body = updateUserSchema.parse(req.body);
    const actor = (req as AuthenticatedRequest).auth!;
    if (id === actor.userId && body.status === 'INACTIVE') throw new AppError(422, 'INVALID_OPERATION', 'You cannot deactivate your own account');
    const before = await prisma.user.findUnique({ where: { id }, select: { id: true, displayName: true, status: true } });
    if (!before) throw new AppError(404, 'NOT_FOUND', 'User was not found');
    const updated = await prisma.$transaction(async (tx) => {
      if (body.roleIds) { await tx.userRole.deleteMany({ where: { userId: id } }); await tx.userRole.createMany({ data: body.roleIds.map((roleId) => ({ userId: id, roleId })) }); }
      if (body.warehouseIds) { await tx.userWarehouse.deleteMany({ where: { userId: id } }); await tx.userWarehouse.createMany({ data: body.warehouseIds.map((warehouseId) => ({ userId: id, warehouseId })) }); }
      const result = await tx.user.update({ where: { id }, data: { displayName: body.displayName, status: body.status }, select: { id: true, email: true, displayName: true, status: true } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: 'USER_UPDATED', entityType: 'USER', entityId: id, requestId: res.locals.requestId, before, after: { displayName: result.displayName, status: result.status, roleIds: body.roleIds, warehouseIds: body.warehouseIds } } });
      return result;
    });
    res.json({ data: updated });
  } catch (error) { next(error); }
});
