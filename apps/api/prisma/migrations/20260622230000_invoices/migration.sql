-- CC o NIT del cliente (para cuentas de cobro).
ALTER TABLE "Customer" ADD COLUMN "taxId" TEXT;

-- Cuenta de cobro: documento generado desde un pedido con snapshots inmutables.
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "orderId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerTaxId" TEXT,
    "customerAddress" TEXT,
    "customerPhone" TEXT,
    "items" JSONB NOT NULL,
    "subtotalCop" INTEGER NOT NULL,
    "deliveryCop" INTEGER NOT NULL DEFAULT 0,
    "totalCop" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_number_idx" ON "Invoice"("number");

-- Datos fijos de empresa/vendedor + próximo consecutivo (fila única id='default').
CREATE TABLE "InvoiceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'La Hora del Venado',
    "companyAddress" TEXT NOT NULL DEFAULT 'Carrera 25 #12 Sur 59 Local 101 Mall Complex los Balsos, Medellín, Colombia',
    "companyContact" TEXT NOT NULL DEFAULT '(311) 7203872',
    "sellerName" TEXT NOT NULL DEFAULT 'Camila Ortiz Echavarría',
    "sellerCC" TEXT NOT NULL DEFAULT '1017236585',
    "sellerRut" TEXT NOT NULL DEFAULT '96040900715-5',
    "paymentInfo" TEXT NOT NULL DEFAULT 'Cuenta de Ahorros Bancolombia # 85000001519 Camila Ortiz Echavarria cc: 1017236585',
    "nextNumber" INTEGER NOT NULL DEFAULT 1802,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("id")
);
