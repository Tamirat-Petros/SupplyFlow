import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors.js';
import { dispatchReservation, releaseReservation, reserveStock } from '../inventory/inventory.service.js';

type Transaction = Prisma.TransactionClient;
type SalesLineInput = { productId: string; orderedQty: number; unitPrice: string };
type ShipmentLineInput = { salesOrderLineId: string; quantity: number };
const number = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

export async function createSalesOrder(tx: Transaction, input: { customerId: string; warehouseId: string; deliveryAddress?: string; requestedAt?: Date; notes?: string; lines: SalesLineInput[]; actorId: string }) {
  const [customer, warehouse] = await Promise.all([tx.customer.findUnique({ where: { id: input.customerId }, select: { active: true } }), tx.warehouse.findUnique({ where: { id: input.warehouseId }, select: { active: true } })]);
  if (!customer?.active) throw new AppError(422, 'CUSTOMER_UNAVAILABLE', 'Customer is unavailable');
  if (!warehouse?.active) throw new AppError(422, 'WAREHOUSE_UNAVAILABLE', 'Warehouse is unavailable');
  const products = await tx.product.findMany({ where: { id: { in: input.lines.map((line) => line.productId) }, active: true }, select: { id: true } });
  if (products.length !== input.lines.length) throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'Every ordered product must be active');
  return tx.salesOrder.create({ data: { number: number('SO'), customerId: input.customerId, warehouseId: input.warehouseId, deliveryAddress: input.deliveryAddress, requestedAt: input.requestedAt, notes: input.notes, createdById: input.actorId, lines: { create: input.lines } }, include: { lines: true } });
}

export async function confirmSalesOrder(tx: Transaction, salesOrderId: string, actorId: string) {
  await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId}::uuid FOR UPDATE`;
  const order = await tx.salesOrder.findUnique({ where: { id: salesOrderId }, include: { lines: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Sales order was not found');
  if (order.status !== 'DRAFT') throw new AppError(409, 'INVALID_SALES_ORDER_STATE', 'Only draft sales orders can be confirmed');
  for (const line of order.lines) {
    await reserveStock(tx, { productId: line.productId, warehouseId: order.warehouseId, quantity: line.orderedQty, referenceId: `${order.id}:${line.id}`, actorId });
  }
  return tx.salesOrder.update({ where: { id: order.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() }, include: { lines: true } });
}

export async function dispatchSalesOrder(tx: Transaction, salesOrderId: string, lines: ShipmentLineInput[], actorId: string) {
  await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId}::uuid FOR UPDATE`;
  const order = await tx.salesOrder.findUnique({ where: { id: salesOrderId }, include: { lines: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Sales order was not found');
  if (!['CONFIRMED', 'PARTIALLY_FULFILLED'].includes(order.status)) throw new AppError(409, 'INVALID_SALES_ORDER_STATE', 'This sales order cannot be dispatched');
  const orderLines = new Map(order.lines.map((line) => [line.id, line]));
  for (const line of lines) {
    const orderLine = orderLines.get(line.salesOrderLineId);
    if (!orderLine || line.quantity > orderLine.orderedQty - orderLine.fulfilledQty - orderLine.cancelledQty) throw new AppError(422, 'INVALID_SHIPMENT_LINE', 'Shipment quantity exceeds the order balance');
    const reservation = await tx.stockReservation.findFirst({ where: { referenceId: `${order.id}:${orderLine.id}`, status: 'ACTIVE' }, select: { id: true, remainingQty: true } });
    if (!reservation || line.quantity > reservation.remainingQty) throw new AppError(409, 'RESERVATION_UNAVAILABLE', 'Order stock reservation is unavailable');
    await dispatchReservation(tx, reservation.id, line.quantity, actorId);
    await tx.salesOrderLine.update({ where: { id: orderLine.id }, data: { fulfilledQty: { increment: line.quantity } } });
  }
  const allFulfilled = order.lines.every((line) => line.fulfilledQty + (lines.find((entry) => entry.salesOrderLineId === line.id)?.quantity ?? 0) === line.orderedQty);
  const shipment = await tx.shipment.create({ data: { number: number('SHP'), salesOrderId: order.id, warehouseId: order.warehouseId, createdById: actorId, lines: { create: lines.map((line) => ({ salesOrderLineId: line.salesOrderLineId, productId: orderLines.get(line.salesOrderLineId)!.productId, quantity: line.quantity })) } }, include: { lines: true } });
  await tx.salesOrder.update({ where: { id: order.id }, data: { status: allFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED' } });
  return shipment;
}

export async function cancelSalesOrder(tx: Transaction, salesOrderId: string, reason: string) {
  await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId}::uuid FOR UPDATE`;
  const order = await tx.salesOrder.findUnique({ where: { id: salesOrderId }, include: { lines: true } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Sales order was not found');
  if (!['DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED'].includes(order.status)) throw new AppError(409, 'INVALID_SALES_ORDER_STATE', 'This sales order cannot be cancelled');
  const reservations = await tx.stockReservation.findMany({ where: { referenceId: { startsWith: `${order.id}:` }, status: 'ACTIVE' }, select: { id: true } });
  for (const reservation of reservations) await releaseReservation(tx, reservation.id);
  for (const line of order.lines) await tx.salesOrderLine.update({ where: { id: line.id }, data: { cancelledQty: line.orderedQty - line.fulfilledQty } });
  return tx.salesOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
}
