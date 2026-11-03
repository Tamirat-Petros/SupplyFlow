CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "ReceiptStatus" AS ENUM ('POSTED', 'CANCELLED');

CREATE TABLE "purchase_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "number" TEXT NOT NULL UNIQUE, "supplier_id" UUID NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT, "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "expected_at" TIMESTAMPTZ, "notes" TEXT, "created_by_id" UUID NOT NULL, "approved_by_id" UUID, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "approved_at" TIMESTAMPTZ
);
CREATE INDEX "purchase_orders_supplier_id_status_idx" ON "purchase_orders" ("supplier_id", "status");
CREATE INDEX "purchase_orders_warehouse_id_status_idx" ON "purchase_orders" ("warehouse_id", "status");
CREATE TABLE "purchase_order_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "purchase_order_id" UUID NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT, "ordered_qty" INTEGER NOT NULL, "accepted_received_qty" INTEGER NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(18,2) NOT NULL, UNIQUE ("purchase_order_id", "product_id"), CHECK ("ordered_qty" > 0), CHECK ("accepted_received_qty" >= 0), CHECK ("accepted_received_qty" <= "ordered_qty"), CHECK ("unit_cost" >= 0)
);
CREATE TABLE "purchase_receipts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "number" TEXT NOT NULL UNIQUE, "purchase_order_id" UUID NOT NULL REFERENCES "purchase_orders"("id") ON DELETE RESTRICT,
  "supplier_reference" TEXT, "status" "ReceiptStatus" NOT NULL DEFAULT 'POSTED', "received_by_id" UUID NOT NULL, "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "purchase_receipts_purchase_order_id_received_at_idx" ON "purchase_receipts" ("purchase_order_id", "received_at");
CREATE TABLE "purchase_receipt_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "purchase_receipt_id" UUID NOT NULL REFERENCES "purchase_receipts"("id") ON DELETE CASCADE,
  "purchase_order_line_id" UUID NOT NULL REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT, "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "accepted_qty" INTEGER NOT NULL DEFAULT 0, "rejected_qty" INTEGER NOT NULL DEFAULT 0, "reason" TEXT, UNIQUE ("purchase_receipt_id", "purchase_order_line_id"), CHECK ("accepted_qty" >= 0), CHECK ("rejected_qty" >= 0), CHECK ("accepted_qty" + "rejected_qty" > 0)
);
