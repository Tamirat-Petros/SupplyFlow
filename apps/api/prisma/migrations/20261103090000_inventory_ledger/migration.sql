CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'RESERVATION', 'RELEASE', 'SALE_DISPATCH', 'TRANSFER_OUT', 'TRANSFER_IN', 'CUSTOMER_RETURN', 'ADJUSTMENT');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "inventory_balances" (
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
  "on_hand" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("product_id", "warehouse_id"),
  CHECK ("on_hand" >= 0), CHECK ("reserved" >= 0), CHECK ("reserved" <= "on_hand")
);

CREATE TABLE "stock_movements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "movement_group_id" UUID NOT NULL, "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT, "quantity" INTEGER NOT NULL,
  "movement_type" "StockMovementType" NOT NULL, "reference_type" TEXT, "reference_id" TEXT, "reason" TEXT,
  "actor_id" UUID, "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("quantity" <> 0)
);
CREATE INDEX "stock_movements_product_id_warehouse_id_occurred_at_idx" ON "stock_movements" ("product_id", "warehouse_id", "occurred_at");
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements" ("reference_type", "reference_id");

CREATE TABLE "stock_reservations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT, "reference_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL, "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE', "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("quantity" > 0)
);
CREATE INDEX "stock_reservations_reference_id_status_idx" ON "stock_reservations" ("reference_id", "status");
CREATE INDEX "stock_reservations_product_id_warehouse_id_status_idx" ON "stock_reservations" ("product_id", "warehouse_id", "status");

CREATE TABLE "warehouse_transfers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "number" TEXT NOT NULL UNIQUE, "source_warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
  "destination_warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT, "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "dispatched_at" TIMESTAMPTZ, "received_at" TIMESTAMPTZ, "created_by_id" UUID NOT NULL,
  CHECK ("source_warehouse_id" <> "destination_warehouse_id")
);
CREATE INDEX "warehouse_transfers_source_warehouse_id_status_idx" ON "warehouse_transfers" ("source_warehouse_id", "status");
CREATE INDEX "warehouse_transfers_destination_warehouse_id_status_idx" ON "warehouse_transfers" ("destination_warehouse_id", "status");
CREATE TABLE "warehouse_transfer_lines" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "transfer_id" UUID NOT NULL REFERENCES "warehouse_transfers"("id") ON DELETE CASCADE, "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT, "requested_qty" INTEGER NOT NULL, "dispatched_qty" INTEGER NOT NULL DEFAULT 0, "received_qty" INTEGER NOT NULL DEFAULT 0, UNIQUE ("transfer_id", "product_id"), CHECK ("requested_qty" > 0), CHECK ("dispatched_qty" >= 0), CHECK ("received_qty" >= 0), CHECK ("received_qty" <= "dispatched_qty"), CHECK ("dispatched_qty" <= "requested_qty"));
