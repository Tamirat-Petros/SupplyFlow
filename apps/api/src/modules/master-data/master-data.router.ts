import { Router } from 'express';
import { z } from 'zod';
import { recordAuditEvent } from '../../common/audit.js';
import { AppError } from '../../common/errors.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../auth/auth.middleware.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';

const idSchema = z.string().uuid();
const optionalString = z.string().trim().min(1).max(500).optional().nullable();
const activeSchema = z.object({ active: z.boolean() });
const warehouseSchema = z.object({ code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9_-]+$/i).transform((value) => value.toUpperCase()), name: z.string().trim().min(2).max(120), address: optionalString });
const categorySchema = z.object({ name: z.string().trim().min(2).max(120), parentId: z.string().uuid().optional().nullable() });
const productSchema = z.object({ sku: z.string().trim().min(2).max(64).transform((value) => value.toUpperCase()), name: z.string().trim().min(2).max(180), description: optionalString, categoryId: z.string().uuid().optional().nullable(), baseUnit: z.string().trim().min(1).max(20).default('each'), barcode: z.string().trim().min(3).max(64).optional().nullable(), reorderPoint: z.number().int().nonnegative().optional().nullable(), reorderQty: z.number().int().positive().optional().nullable() });
const partnerSchema = z.object({ name: z.string().trim().min(2).max(180), contactName: optionalString, email: z.string().email().max(254).optional().nullable(), phone: optionalString, address: optionalString, paymentTerms: optionalString, creditLimit: z.number().nonnegative().max(999_999_999_999).optional().nullable() });

function actor(req: AuthenticatedRequest) { return req.auth!.userId; }
async function audit(req: AuthenticatedRequest, action: string, entityType: string, entityId: string, after: Record<string, unknown>) {
  await recordAuditEvent({ actorId: actor(req), action, entityType, entityId, requestId: req.res?.locals.requestId as string | undefined, after });
}

export const warehousesRouter = Router();
warehousesRouter.use(authenticate);
warehousesRouter.get('/', requirePermission('warehouses.read'), async (_req, res, next) => {
  try { res.json({ data: await prisma.warehouse.findMany({ orderBy: { code: 'asc' } }) }); } catch (error) { next(error); }
});
warehousesRouter.post('/', requirePermission('warehouses.manage'), async (req, res, next) => {
  try { const data = warehouseSchema.parse(req.body); const created = await prisma.warehouse.create({ data }); await audit(req as AuthenticatedRequest, 'WAREHOUSE_CREATED', 'WAREHOUSE', created.id, data); res.status(201).json({ data: created }); } catch (error) { next(error); }
});
warehousesRouter.patch('/:id', requirePermission('warehouses.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const data = warehouseSchema.partial().merge(activeSchema.partial()).parse(req.body); const updated = await prisma.warehouse.update({ where: { id }, data }); await audit(req as AuthenticatedRequest, 'WAREHOUSE_UPDATED', 'WAREHOUSE', id, data); res.json({ data: updated }); } catch (error) { next(error); }
});

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.get('/', requirePermission('catalog.read'), async (_req, res, next) => {
  try { res.json({ data: await prisma.category.findMany({ orderBy: { name: 'asc' }, include: { parent: { select: { id: true, name: true } } } }) }); } catch (error) { next(error); }
});
categoriesRouter.post('/', requirePermission('catalog.manage'), async (req, res, next) => {
  try { const data = categorySchema.parse(req.body); if (data.parentId && !await prisma.category.findUnique({ where: { id: data.parentId } })) throw new AppError(422, 'INVALID_PARENT', 'Parent category was not found'); const created = await prisma.category.create({ data }); await audit(req as AuthenticatedRequest, 'CATEGORY_CREATED', 'CATEGORY', created.id, data); res.status(201).json({ data: created }); } catch (error) { next(error); }
});
categoriesRouter.patch('/:id', requirePermission('catalog.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const data = categorySchema.partial().merge(activeSchema.partial()).parse(req.body); if (data.parentId === id) throw new AppError(422, 'INVALID_PARENT', 'A category cannot be its own parent'); const updated = await prisma.category.update({ where: { id }, data }); await audit(req as AuthenticatedRequest, 'CATEGORY_UPDATED', 'CATEGORY', id, data); res.json({ data: updated }); } catch (error) { next(error); }
});

export const productsRouter = Router();
productsRouter.use(authenticate);
productsRouter.get('/', requirePermission('catalog.read'), async (req, res, next) => {
  try {
    const query = z.object({ q: z.string().trim().max(100).optional(), active: z.enum(['true', 'false']).optional() }).parse(req.query);
    res.json({ data: await prisma.product.findMany({ where: { ...(query.active ? { active: query.active === 'true' } : {}), ...(query.q ? { OR: [{ sku: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }] } : {}) }, include: { category: { select: { id: true, name: true } } }, orderBy: { name: 'asc' } }) });
  } catch (error) { next(error); }
});
productsRouter.post('/', requirePermission('catalog.manage'), async (req, res, next) => {
  try { const data = productSchema.parse(req.body); const created = await prisma.product.create({ data }); await audit(req as AuthenticatedRequest, 'PRODUCT_CREATED', 'PRODUCT', created.id, data); res.status(201).json({ data: created }); } catch (error) { next(error); }
});
productsRouter.patch('/:id', requirePermission('catalog.manage'), async (req, res, next) => {
  try { const id = idSchema.parse(req.params.id); const data = productSchema.partial().merge(activeSchema.partial()).parse(req.body); const updated = await prisma.product.update({ where: { id }, data }); await audit(req as AuthenticatedRequest, 'PRODUCT_UPDATED', 'PRODUCT', id, data); res.json({ data: updated }); } catch (error) { next(error); }
});

export const suppliersRouter = Router();
suppliersRouter.use(authenticate);
suppliersRouter.get('/', requirePermission('suppliers.read'), async (_req, res, next) => { try { res.json({ data: await prisma.supplier.findMany({ orderBy: { name: 'asc' } }) }); } catch (error) { next(error); } });
suppliersRouter.post('/', requirePermission('suppliers.manage'), async (req, res, next) => { try { const data = partnerSchema.omit({ creditLimit: true }).parse(req.body); const created = await prisma.supplier.create({ data }); await audit(req as AuthenticatedRequest, 'SUPPLIER_CREATED', 'SUPPLIER', created.id, data); res.status(201).json({ data: created }); } catch (error) { next(error); } });
suppliersRouter.patch('/:id', requirePermission('suppliers.manage'), async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const data = partnerSchema.omit({ creditLimit: true }).partial().merge(activeSchema.partial()).parse(req.body); const updated = await prisma.supplier.update({ where: { id }, data }); await audit(req as AuthenticatedRequest, 'SUPPLIER_UPDATED', 'SUPPLIER', id, data); res.json({ data: updated }); } catch (error) { next(error); } });

export const customersRouter = Router();
customersRouter.use(authenticate);
customersRouter.get('/', requirePermission('customers.read'), async (_req, res, next) => { try { res.json({ data: await prisma.customer.findMany({ orderBy: { name: 'asc' } }) }); } catch (error) { next(error); } });
customersRouter.post('/', requirePermission('customers.manage'), async (req, res, next) => { try { const data = partnerSchema.parse(req.body); const created = await prisma.customer.create({ data }); await audit(req as AuthenticatedRequest, 'CUSTOMER_CREATED', 'CUSTOMER', created.id, data); res.status(201).json({ data: created }); } catch (error) { next(error); } });
customersRouter.patch('/:id', requirePermission('customers.manage'), async (req, res, next) => { try { const id = idSchema.parse(req.params.id); const data = partnerSchema.partial().merge(activeSchema.partial()).parse(req.body); const updated = await prisma.customer.update({ where: { id }, data }); await audit(req as AuthenticatedRequest, 'CUSTOMER_UPDATED', 'CUSTOMER', id, data); res.json({ data: updated }); } catch (error) { next(error); } });
