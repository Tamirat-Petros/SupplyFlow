import { randomUUID } from 'node:crypto';
import { Prisma, StockMovementType } from '@prisma/client';
import { AppError } from '../../common/errors.js';

type Transaction = Prisma.TransactionClient;
type LockedBalance = { product_id: string; warehouse_id: string; on_hand: number; reserved: number };

export function assertWarehouseScope(roleNames: string[], warehouseIds: string[], warehouseId: string) {
  if (!roleNames.includes('ADMIN') && !warehouseIds.includes(warehouseId)) {
    throw new AppError(403, 'WAREHOUSE_FORBIDDEN', 'You do not have access to this warehouse');
  }
}

async function lockBalance(tx: Transaction, productId: string, warehouseId: string): Promise<LockedBalance> {
  await tx.inventoryBalance.upsert({ where: { productId_warehouseId: { productId, warehouseId } }, update: {}, create: { productId, warehouseId } });
  const rows = await tx.$queryRaw<LockedBalance[]>(Prisma.sql`
    SELECT product_id, warehouse_id, on_hand, reserved
    FROM inventory_balances
    WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid
    FOR UPDATE
  `);
  const balance = rows[0];
  if (!balance) throw new AppError(500, 'INVENTORY_LOCK_FAILED', 'Could not lock the inventory balance');
  return balance;
}

async function addMovement(tx: Transaction, input: { productId: string; warehouseId: string; quantity: number; movementType: StockMovementType; referenceType?: string; referenceId?: string; reason?: string; actorId: string; movementGroupId?: string }) {
  if (input.quantity === 0) return;
  await tx.stockMovement.create({ data: { ...input, movementGroupId: input.movementGroupId ?? randomUUID() } });
}

async function verifyMasterData(tx: Transaction, productId: string, warehouseId: string) {
  const [product, warehouse] = await Promise.all([tx.product.findUnique({ where: { id: productId }, select: { active: true } }), tx.warehouse.findUnique({ where: { id: warehouseId }, select: { active: true } })]);
  if (!product?.active) throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'Product is unavailable');
  if (!warehouse?.active) throw new AppError(422, 'WAREHOUSE_UNAVAILABLE', 'Warehouse is unavailable');
}

export async function receiveStock(tx: Transaction, input: { productId: string; warehouseId: string; quantity: number; referenceId: string; reason?: string; actorId: string }) {
  await verifyMasterData(tx, input.productId, input.warehouseId);
  const current = await lockBalance(tx, input.productId, input.warehouseId);
  const nextOnHand = current.on_hand + input.quantity;
  await tx.inventoryBalance.update({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } }, data: { onHand: nextOnHand, version: { increment: 1 } } });
  await addMovement(tx, { ...input, movementType: 'RECEIPT', referenceType: 'RECEIPT' });
  return { onHand: nextOnHand, reserved: current.reserved, available: nextOnHand - current.reserved };
}

export async function adjustStock(tx: Transaction, input: { productId: string; warehouseId: string; quantity: number; reason: string; actorId: string }) {
  await verifyMasterData(tx, input.productId, input.warehouseId);
  const current = await lockBalance(tx, input.productId, input.warehouseId);
  const nextOnHand = current.on_hand + input.quantity;
  if (nextOnHand < current.reserved) throw new AppError(422, 'INSUFFICIENT_STOCK', 'The adjustment would reduce stock below active reservations');
  await tx.inventoryBalance.update({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } }, data: { onHand: nextOnHand, version: { increment: 1 } } });
  await addMovement(tx, { ...input, movementType: 'ADJUSTMENT', referenceType: 'ADJUSTMENT' });
  return { onHand: nextOnHand, reserved: current.reserved, available: nextOnHand - current.reserved };
}

export async function reserveStock(tx: Transaction, input: { productId: string; warehouseId: string; quantity: number; referenceId: string; expiresAt?: Date; actorId: string }) {
  await verifyMasterData(tx, input.productId, input.warehouseId);
  const current = await lockBalance(tx, input.productId, input.warehouseId);
  if (current.on_hand - current.reserved < input.quantity) throw new AppError(422, 'INSUFFICIENT_AVAILABLE_STOCK', 'Insufficient available inventory');
  const { actorId: _actorId, ...reservationData } = input;
  const reservation = await tx.stockReservation.create({ data: reservationData });
  await tx.inventoryBalance.update({ where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } }, data: { reserved: { increment: input.quantity }, version: { increment: 1 } } });
  return reservation;
}

async function lockReservation(tx: Transaction, reservationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; product_id: string; warehouse_id: string; quantity: number; status: string }>>(Prisma.sql`
    SELECT id, product_id, warehouse_id, quantity, status FROM stock_reservations WHERE id = ${reservationId}::uuid FOR UPDATE
  `);
  const reservation = rows[0];
  if (!reservation) throw new AppError(404, 'NOT_FOUND', 'Stock reservation was not found');
  if (reservation.status !== 'ACTIVE') throw new AppError(409, 'INVALID_RESERVATION_STATE', 'Stock reservation is no longer active');
  return reservation;
}

export async function releaseReservation(tx: Transaction, reservationId: string) {
  const reservation = await lockReservation(tx, reservationId);
  const current = await lockBalance(tx, reservation.product_id, reservation.warehouse_id);
  await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'RELEASED' } });
  await tx.inventoryBalance.update({ where: { productId_warehouseId: { productId: reservation.product_id, warehouseId: reservation.warehouse_id } }, data: { reserved: current.reserved - reservation.quantity, version: { increment: 1 } } });
  return { productId: reservation.product_id, warehouseId: reservation.warehouse_id, quantity: reservation.quantity };
}

export async function dispatchReservation(tx: Transaction, reservationId: string, actorId: string) {
  const reservation = await lockReservation(tx, reservationId);
  const current = await lockBalance(tx, reservation.product_id, reservation.warehouse_id);
  if (current.on_hand < reservation.quantity || current.reserved < reservation.quantity) throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Reservation cannot be dispatched against current inventory');
  await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'CONSUMED' } });
  await tx.inventoryBalance.update({ where: { productId_warehouseId: { productId: reservation.product_id, warehouseId: reservation.warehouse_id } }, data: { onHand: current.on_hand - reservation.quantity, reserved: current.reserved - reservation.quantity, version: { increment: 1 } } });
  await addMovement(tx, { productId: reservation.product_id, warehouseId: reservation.warehouse_id, quantity: -reservation.quantity, movementType: 'SALE_DISPATCH', referenceType: 'RESERVATION', referenceId: reservation.id, actorId });
  return { productId: reservation.product_id, warehouseId: reservation.warehouse_id, quantity: reservation.quantity };
}
