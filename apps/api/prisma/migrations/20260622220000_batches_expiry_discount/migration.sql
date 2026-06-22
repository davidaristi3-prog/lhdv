-- Vida útil por producto (control de vencimiento) y descuento % por cliente (mayorista).
ALTER TABLE "Product" ADD COLUMN "shelfLifeDays" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "discountPercent" INTEGER;

-- Lotes de producto terminado: cada producción con su fecha de vencimiento.
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockBatch_productVariantId_idx" ON "StockBatch"("productVariantId");
CREATE INDEX "StockBatch_expiresAt_idx" ON "StockBatch"("expiresAt");

ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
