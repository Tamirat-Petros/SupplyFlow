import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../auth/auth.middleware.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { assertWarehouseScope } from '../inventory/inventory.service.js';
import { cancelSalesOrder, confirmSalesOrder, createSalesOrder, dispatchSalesOrder } from './sales.service.js';

const idSchema = z.string().uuid();
const orderSchema = z.object({ customerId: z.string().uuid(), warehouseId: z.string().uuid(), deliveryAddress: z.string().trim().max(500).optional(), requestedAt: z.string().datetime().optional(), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ productId: z.string().uuid(), orderedQty: z.number().int().positive(), unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/) })).min(1) }).refine((data) => new Set(data.lines.map((line) => line.productId)).size === data.lines.length, 'Each product can appear once');
const shipmentSchema = z.object({ lines: z.array(z.object({ salesOrderLineId: z.string().uuid(), quantity: z.number().int().positive() })).min(1) }).refine((data) => new Set(data.lines.map((line) => line.salesOrderLineId)).size === data.lines.length, 'Each order line can appear once');

export const salesRouter = Router();
salesRouter.use(authenticate);

salesRouter.get('/orders', requirePermission('sales.read'), async (req, res, next) => {
  try { const auth = (req as AuthenticatedRequest).auth!; const orders = await prisma.salesOrder.findMany({ where: auth.roleNames.includes('ADMIN') ? {} : { warehouseId: { in: auth.warehouseIds } }, include: { customer: { select: { name: true } }, warehouse: { select: { code: true } }, lines: true, shipments: { select: { id: true, number: true, status: true } } }, orderBy: { createdAt: 'desc' } }); res.json({ data: orders }); } catch (error) { next(error); }
});
salesRouter.post('/orders', requirePermission('sales.manage'), async (req, res, next) => {
  try { const body = orderSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; assertWarehouseScope(auth.roleNames, auth.warehouseIds, body.warehouseId); const order = await prisma.$transaction(async (tx) => { const created = await createSalesOrder(tx, { ...body, requestedAt: body.requestedAt ? new Date(body.requestedAt) : undefined, actorId: auth.userId }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'SALES_ORDER_CREATED', entityType: 'SALES_ORDER', entityId: created.id, requestId: res.locals.requestId, after: { number: created.number } } }); return created; }); res.status(201).json({ data: order }); } catch (error) { next(error); }
});
salesRouter.post('/orders/:id/confirm', requirePermission('sales.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const auth = (req as AuthenticatedRequest).auth!; const existing = await prisma.salesOrder.findUnique({ where: { id }, select: { warehouseId: true } }); if (!existing) throw new AppError(404, 'NOT_FOUND', 'Sales order was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, existing.warehouseId); const order = await prisma.$transaction(async (tx) => { const confirmed = await confirmSalesOrder(tx, id, auth.userId); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'SALES_ORDER_CONFIRMED', entityType: 'SALES_ORDER', entityId: id, requestId: res.locals.requestId } }); return confirmed; }); res.json({ data: order }); } catch (error) { next(error); }
});
salesRouter.post('/orders/:id/shipments', requirePermission('sales.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const body = shipmentSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; const existing = await prisma.salesOrder.findUnique({ where: { id }, select: { warehouseId: true } }); if (!existing) throw new AppError(404, 'NOT_FOUND', 'Sales order was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, existing.warehouseId); const shipment = await prisma.$transaction(async (tx) => { const created = await dispatchSalesOrder(tx, id, body.lines, auth.userId); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'SHIPMENT_DISPATCHED', entityType: 'SHIPMENT', entityId: created.id, requestId: res.locals.requestId } }); return created; }); res.status(201).json({ data: shipment }); } catch (error) { next(error); }
});
salesRouter.post('/orders/:id/cancel', requirePermission('sales.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const body = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body); const auth = (req as AuthenticatedRequest).auth!; const existing = await prisma.salesOrder.findUnique({ where: { id }, select: { warehouseId: true } }); if (!existing) throw new AppError(404, 'NOT_FOUND', 'Sales order was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, existing.warehouseId); const order = await prisma.$transaction(async (tx) => { const cancelled = await cancelSalesOrder(tx, id, body.reason); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'SALES_ORDER_CANCELLED', entityType: 'SALES_ORDER', entityId: id, requestId: res.locals.requestId, reason: body.reason } }); return cancelled; }); res.json({ data: order }); } catch (error) { next(error); }
});
salesRouter.post('/shipments/:id/deliver', requirePermission('sales.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const body = z.object({ proofReference: z.string().trim().min(1).max(200) }).parse(req.body); const auth = (req as AuthenticatedRequest).auth!; const shipment = await prisma.shipment.findUnique({ where: { id }, select: { warehouseId: true, status: true } }); if (!shipment) throw new AppError(404, 'NOT_FOUND', 'Shipment was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, shipment.warehouseId); if (shipment.status !== 'DISPATCHED') throw new AppError(409, 'INVALID_SHIPMENT_STATE', 'Only dispatched shipments can be delivered'); const delivered = await prisma.$transaction(async (tx) => { const result = await tx.shipment.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), proofReference: body.proofReference } }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'SHIPMENT_DELIVERED', entityType: 'SHIPMENT', entityId: id, requestId: res.locals.requestId, after: body } }); return result; }); res.json({ data: delivered }); } catch (error) { next(error); }
});
