import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../auth/auth.middleware.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { adjustStock, assertWarehouseScope, dispatchReservation, receiveStock, releaseReservation, reserveStock } from './inventory.service.js';

const stockChangeSchema = z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid(), quantity: z.number().int().positive(), referenceId: z.string().trim().min(1).max(100), reason: z.string().trim().min(3).max(500).optional() });
const adjustmentSchema = z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid(), quantity: z.number().int().refine((value) => value !== 0), reason: z.string().trim().min(3).max(500) });
const reservationSchema = z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid(), quantity: z.number().int().positive(), referenceId: z.string().trim().min(1).max(100), expiresAt: z.string().datetime().optional() });

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

inventoryRouter.get('/balances', requirePermission('inventory.read'), async (req, res, next) => {
  try {
    const query = z.object({ warehouseId: z.string().uuid().optional(), productId: z.string().uuid().optional() }).parse(req.query);
    const auth = (req as AuthenticatedRequest).auth!;
    if (query.warehouseId) assertWarehouseScope(auth.roleNames, auth.warehouseIds, query.warehouseId);
    const scope = auth.roleNames.includes('ADMIN') ? undefined : auth.warehouseIds;
    const balances = await prisma.inventoryBalance.findMany({ where: { ...(query.warehouseId ? { warehouseId: query.warehouseId } : scope ? { warehouseId: { in: scope } } : {}), ...(query.productId ? { productId: query.productId } : {}) }, include: { product: { select: { sku: true, name: true, baseUnit: true } }, warehouse: { select: { code: true, name: true } } }, orderBy: [{ warehouse: { code: 'asc' } }, { product: { name: 'asc' } }] });
    res.json({ data: balances.map((balance) => ({ ...balance, available: balance.onHand - balance.reserved })) });
  } catch (error) { next(error); }
});

inventoryRouter.post('/receipts', requirePermission('inventory.manage'), async (req, res, next) => {
  try { const body = stockChangeSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; assertWarehouseScope(auth.roleNames, auth.warehouseIds, body.warehouseId); const result = await prisma.$transaction(async (tx) => { const balance = await receiveStock(tx, { ...body, actorId: auth.userId }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'STOCK_RECEIVED', entityType: 'PRODUCT', entityId: body.productId, requestId: res.locals.requestId, after: body } }); return balance; }); res.status(201).json({ data: result }); } catch (error) { next(error); }
});

inventoryRouter.post('/adjustments', requirePermission('inventory.manage'), async (req, res, next) => {
  try { const body = adjustmentSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; assertWarehouseScope(auth.roleNames, auth.warehouseIds, body.warehouseId); const result = await prisma.$transaction(async (tx) => { const balance = await adjustStock(tx, { ...body, actorId: auth.userId }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'STOCK_ADJUSTED', entityType: 'PRODUCT', entityId: body.productId, requestId: res.locals.requestId, reason: body.reason, after: body } }); return balance; }); res.json({ data: result }); } catch (error) { next(error); }
});

inventoryRouter.post('/reservations', requirePermission('inventory.manage'), async (req, res, next) => {
  try { const body = reservationSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; assertWarehouseScope(auth.roleNames, auth.warehouseIds, body.warehouseId); const result = await prisma.$transaction(async (tx) => { const reservation = await reserveStock(tx, { ...body, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined, actorId: auth.userId }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'STOCK_RESERVED', entityType: 'RESERVATION', entityId: reservation.id, requestId: res.locals.requestId, after: body } }); return reservation; }); res.status(201).json({ data: result }); } catch (error) { next(error); }
});

inventoryRouter.post('/reservations/:id/release', requirePermission('inventory.manage'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const auth = (req as AuthenticatedRequest).auth!; const reservation = await prisma.stockReservation.findUnique({ where: { id }, select: { warehouseId: true } }); if (!reservation) throw new AppError(404, 'NOT_FOUND', 'Stock reservation was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, reservation.warehouseId); const result = await prisma.$transaction(async (tx) => { const released = await releaseReservation(tx, id); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'RESERVATION_RELEASED', entityType: 'RESERVATION', entityId: id, requestId: res.locals.requestId } }); return released; }); res.json({ data: result }); } catch (error) { next(error); }
});

inventoryRouter.post('/reservations/:id/dispatch', requirePermission('inventory.manage'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const auth = (req as AuthenticatedRequest).auth!; const reservation = await prisma.stockReservation.findUnique({ where: { id }, select: { warehouseId: true } }); if (!reservation) throw new AppError(404, 'NOT_FOUND', 'Stock reservation was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, reservation.warehouseId); const result = await prisma.$transaction(async (tx) => { const dispatched = await dispatchReservation(tx, id, auth.userId); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'RESERVATION_DISPATCHED', entityType: 'RESERVATION', entityId: id, requestId: res.locals.requestId } }); return dispatched; }); res.json({ data: result }); } catch (error) { next(error); }
});
