ALTER TABLE "stock_reservations" ADD COLUMN "remaining_qty" INTEGER;
UPDATE "stock_reservations" SET "remaining_qty" = "quantity";
ALTER TABLE "stock_reservations" ALTER COLUMN "remaining_qty" SET NOT NULL;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_remaining_qty_check" CHECK ("remaining_qty" >= 0 AND "remaining_qty" <= "quantity");
