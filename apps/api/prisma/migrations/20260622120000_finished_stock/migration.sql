-- Inventario de producto terminado: stock de productos hechos por adelantado,
-- listos para vender sin pasar por cocina. La existencia actual vive en
-- ProductVariant.readyStock; FinishedStockMovement es el historial.

-- CreateEnum
CREATE TYPE "FinishedMoveType" AS ENUM ('PRODUCTION', 'SALE', 'RETURN', 'ADJUSTMENT');

-- AlterTable: par (objetivo) y existencias listas por presentación
ALTER TABLE "ProductVariant" ADD COLUMN     "parStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readyStock" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: un renglón de pedido puede cubrirse desde el stock terminado
ALTER TABLE "OrderItem" ADD COLUMN     "fromStock" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FinishedStockMovement" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "type" "FinishedMoveType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "orderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishedStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinishedStockMovement_productVariantId_idx" ON "FinishedStockMovement"("productVariantId");

-- CreateIndex
CREATE INDEX "FinishedStockMovement_orderId_idx" ON "FinishedStockMovement"("orderId");

-- AddForeignKey
ALTER TABLE "FinishedStockMovement" ADD CONSTRAINT "FinishedStockMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
