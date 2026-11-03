CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');
CREATE TYPE "ShipmentStatus" AS ENUM ('DISPATCHED', 'DELIVERED', 'FAILED');
CREATE TABLE "sales_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "number" TEXT NOT NULL UNIQUE, "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT, "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "delivery_address" TEXT, "requested_at" TIMESTAMPTZ, "notes" TEXT, "created_by_id" UUID NOT NULL, "confirmed_at" TIMESTAMPTZ, "cancelled_at" TIMESTAMPTZ, "cancellation_reason" TEXT, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sales_orders_customer_id_status_idx" ON "sales_orders" ("customer_id", "status");
CREATE INDEX "sales_orders_warehouse_id_status_idx" ON "sales_orders" ("warehouse_id", "status");
CREATE TABLE "sales_order_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "sales_order_id" UUID NOT NULL REFERENCES "sales_orders"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT, "ordered_qty" INTEGER NOT NULL, "fulfilled_qty" INTEGER NOT NULL DEFAULT 0, "cancelled_qty" INTEGER NOT NULL DEFAULT 0, "unit_price" DECIMAL(18,2) NOT NULL,
  UNIQUE ("sales_order_id", "product_id"), CHECK ("ordered_qty" > 0), CHECK ("fulfilled_qty" >= 0), CHECK ("cancelled_qty" >= 0), CHECK ("fulfilled_qty" + "cancelled_qty" <= "ordered_qty"), CHECK ("unit_price" >= 0)
);
CREATE TABLE "shipments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "number" TEXT NOT NULL UNIQUE, "sales_order_id" UUID NOT NULL REFERENCES "sales_orders"("id") ON DELETE RESTRICT,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT, "status" "ShipmentStatus" NOT NULL DEFAULT 'DISPATCHED', "dispatched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "delivered_at" TIMESTAMPTZ, "proof_reference" TEXT, "exception_note" TEXT, "created_by_id" UUID NOT NULL
);
CREATE INDEX "shipments_sales_order_id_status_idx" ON "shipments" ("sales_order_id", "status");
CREATE TABLE "shipment_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "shipment_id" UUID NOT NULL REFERENCES "shipments"("id") ON DELETE CASCADE,
  "sales_order_line_id" UUID NOT NULL REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT, "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT, "quantity" INTEGER NOT NULL,
  UNIQUE ("shipment_id", "sales_order_line_id"), CHECK ("quantity" > 0)
);
