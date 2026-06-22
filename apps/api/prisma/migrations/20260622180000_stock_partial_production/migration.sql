-- Tomar parcial del stock: un renglón puede cubrirse en parte desde el stock
-- terminado (fromStockQty) y producir el resto. Reemplaza el booleano fromStock.
ALTER TABLE "OrderItem" ADD COLUMN "fromStockQty" INTEGER NOT NULL DEFAULT 0;
UPDATE "OrderItem" SET "fromStockQty" = "quantity" WHERE "fromStock" = true;
ALTER TABLE "OrderItem" DROP COLUMN "fromStock";

-- Pedido interno de producción para reponer stock (entra a cocina como un pedido más).
ALTER TABLE "Order" ADD COLUMN "isStockProduction" BOOLEAN NOT NULL DEFAULT false;
