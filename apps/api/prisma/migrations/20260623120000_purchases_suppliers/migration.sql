-- Compras de insumos: proveedor, renglones y enlace a movimientos de inventario.
-- Todo aditivo (tablas y columnas nullable): seguro en producción.

-- Directorio simple de proveedores (opcional en gastos/compras).
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- Expense gana proveedor y N° de factura (opcionales).
ALTER TABLE "Expense" ADD COLUMN "invoiceNo" TEXT,
ADD COLUMN "supplierId" TEXT;
CREATE INDEX "Expense_supplierId_idx" ON "Expense"("supplierId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Renglón de insumo de una compra (mueve inventario y recalcula costo).
CREATE TABLE "ExpenseLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "packLabel" TEXT,
    "qtyBase" DOUBLE PRECISION NOT NULL,
    "lineCop" INTEGER NOT NULL,

    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseLine_expenseId_idx" ON "ExpenseLine"("expenseId");
CREATE INDEX "ExpenseLine_ingredientId_idx" ON "ExpenseLine"("ingredientId");
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trazabilidad: liga un movimiento de inventario a su renglón de compra.
ALTER TABLE "InventoryMovement" ADD COLUMN "expenseLineId" TEXT;
