import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../auth/auth.middleware.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { assertWarehouseScope } from '../inventory/inventory.service.js';
import { approvePurchaseOrder, createPurchaseOrder, postPurchaseReceipt } from './procurement.service.js';

const orderSchema = z.object({ supplierId: z.string().uuid(), warehouseId: z.string().uuid(), expectedAt: z.string().datetime().optional(), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ productId: z.string().uuid(), orderedQty: z.number().int().positive(), unitCost: z.string().regex(/^\d+(\.\d{1,2})?$/) })).min(1) }).refine((data) => new Set(data.lines.map((line) => line.productId)).size === data.lines.length, 'Each product can appear once');
const receiptSchema = z.object({ supplierReference: z.string().trim().max(120).optional(), lines: z.array(z.object({ purchaseOrderLineId: z.string().uuid(), acceptedQty: z.number().int().nonnegative(), rejectedQty: z.number().int().nonnegative(), reason: z.string().trim().max(500).optional() }).refine((line) => line.acceptedQty + line.rejectedQty > 0, 'A receipt line needs a quantity')).min(1) }).refine((data) => new Set(data.lines.map((line) => line.purchaseOrderLineId)).size === data.lines.length, 'Each order line can appear once');

export const procurementRouter = Router();
procurementRouter.use(authenticate);

procurementRouter.get('/purchase-orders', requirePermission('procurement.read'), async (req, res, next) => {
  try { const auth = (req as AuthenticatedRequest).auth!; const orders = await prisma.purchaseOrder.findMany({ where: auth.roleNames.includes('ADMIN') ? {} : { warehouseId: { in: auth.warehouseIds } }, include: { supplier: { select: { name: true } }, warehouse: { select: { code: true } }, lines: true }, orderBy: { createdAt: 'desc' } }); res.json({ data: orders }); } catch (error) { next(error); }
});

procurementRouter.post('/purchase-orders', requirePermission('procurement.manage'), async (req, res, next) => {
  try { const body = orderSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; assertWarehouseScope(auth.roleNames, auth.warehouseIds, body.warehouseId); const order = await prisma.$transaction(async (tx) => { const created = await createPurchaseOrder(tx, { ...body, expectedAt: body.expectedAt ? new Date(body.expectedAt) : undefined, actorId: auth.userId }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'PURCHASE_ORDER_CREATED', entityType: 'PURCHASE_ORDER', entityId: created.id, requestId: res.locals.requestId, after: { number: created.number } } }); return created; }); res.status(201).json({ data: order }); } catch (error) { next(error); }
});

procurementRouter.post('/purchase-orders/:id/approve', requirePermission('procurement.manage'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const auth = (req as AuthenticatedRequest).auth!; const existing = await prisma.purchaseOrder.findUnique({ where: { id }, select: { warehouseId: true } }); if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, existing.warehouseId); const order = await prisma.$transaction(async (tx) => { const approved = await approvePurchaseOrder(tx, id, auth.userId); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'PURCHASE_ORDER_APPROVED', entityType: 'PURCHASE_ORDER', entityId: id, requestId: res.locals.requestId } }); return approved; }); res.json({ data: order }); } catch (error) { next(error); }
});

procurementRouter.post('/purchase-orders/:id/receipts', requirePermission('procurement.manage'), async (req, res, next) => {
  try { const purchaseOrderId = z.string().uuid().parse(req.params.id); const body = receiptSchema.parse(req.body); const auth = (req as AuthenticatedRequest).auth!; const order = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { warehouseId: true } }); if (!order) throw new AppError(404, 'NOT_FOUND', 'Purchase order was not found'); assertWarehouseScope(auth.roleNames, auth.warehouseIds, order.warehouseId); const receipt = await prisma.$transaction(async (tx) => { const posted = await postPurchaseReceipt(tx, { purchaseOrderId, ...body, actorId: auth.userId }); await tx.auditEvent.create({ data: { actorId: auth.userId, action: 'PURCHASE_RECEIPT_POSTED', entityType: 'PURCHASE_RECEIPT', entityId: posted.id, requestId: res.locals.requestId, after: { purchaseOrderId } } }); return posted; }); res.status(201).json({ data: receipt }); } catch (error) { next(error); }
});
