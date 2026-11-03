import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { receiveStock } from '../inventory/inventory.service.js';

type Transaction = Prisma.TransactionClient;
type PurchaseLineInput = { productId: string; orderedQty: number; unitCost: string };
type ReceiptLineInput = { purchaseOrderLineId: string; acceptedQty: number; rejectedQty: number; reason?: string };

const documentNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

export async function createPurchaseOrder(tx: Transaction, input: { supplierId: string; warehouseId: string; expectedAt?: Date; notes?: string; lines: PurchaseLineInput[]; actorId: string }) {
  const [supplier, warehouse] = await Promise.all([tx.supplier.findUnique({ where: { id: input.supplierId }, select: { active: true } }), tx.warehouse.findUnique({ where: { id: input.warehouseId }, select: { active: true } })]);
  if (!supplier?.active) throw new AppError(422, 'SUPPLIER_UNAVAILABLE', 'Supplier is unavailable');
  if (!warehouse?.active) throw new AppError(422, 'WAREHOUSE_UNAVAILABLE', 'Warehouse is unavailable');
  const products = await tx.product.findMany({ where: { id: { in: input.lines.map((line) => line.productId) }, active: true }, select: { id: true } });
  if (products.length !== input.lines.length) throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'Every ordered product must be active');
  return tx.purchaseOrder.create({ data: { number: documentNumber('PO'), supplierId: input.supplierId, warehouseId: input.warehouseId, expectedAt: input.expectedAt, notes: input.notes, createdById: input.actorId, lines: { create: input.lines } }, include: { lines: true } });
}

export async function approvePurchaseOrder(tx: Transaction, purchaseOrderId: string, actorId: string) {
  const order = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { status: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Purchase order was not found');
  if (order.status !== 'DRAFT') throw new AppError(409, 'INVALID_PURCHASE_ORDER_STATE', 'Only draft purchase orders can be approved');
  return tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: actorId } });
}

export async function postPurchaseReceipt(tx: Transaction, input: { purchaseOrderId: string; supplierReference?: string; lines: ReceiptLineInput[]; actorId: string }) {
  await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${input.purchaseOrderId}::uuid FOR UPDATE`;
  const order = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { lines: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Purchase order was not found');
  if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) throw new AppError(409, 'INVALID_PURCHASE_ORDER_STATE', 'This purchase order cannot be received');
  const orderLines = new Map(order.lines.map((line) => [line.id, line]));
  for (const line of input.lines) {
    const orderLine = orderLines.get(line.purchaseOrderLineId);
    if (!orderLine) throw new AppError(422, 'INVALID_RECEIPT_LINE', 'Receipt line does not belong to this purchase order');
    if (line.acceptedQty > orderLine.orderedQty - orderLine.acceptedReceivedQty) throw new AppError(422, 'OVER_RECEIPT', 'Accepted quantity exceeds the remaining order quantity');
  }
  const receipt = await tx.purchaseReceipt.create({ data: { number: documentNumber('GRN'), purchaseOrderId: order.id, supplierReference: input.supplierReference, receivedById: input.actorId, lines: { create: input.lines.map((line) => ({ ...line, productId: orderLines.get(line.purchaseOrderLineId)!.productId })) } }, include: { lines: true } });
  for (const line of input.lines) {
    const orderLine = orderLines.get(line.purchaseOrderLineId)!;
    if (line.acceptedQty > 0) {
      await tx.purchaseOrderLine.update({ where: { id: orderLine.id }, data: { acceptedReceivedQty: { increment: line.acceptedQty } } });
      await receiveStock(tx, { productId: orderLine.productId, warehouseId: order.warehouseId, quantity: line.acceptedQty, referenceId: receipt.id, reason: 'Accepted purchase receipt', actorId: input.actorId });
    }
  }
  const allReceived = order.lines.every((line) => line.acceptedReceivedQty + (input.lines.find((entry) => entry.purchaseOrderLineId === line.id)?.acceptedQty ?? 0) === line.orderedQty);
  await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } });
  return receipt;
}
