-- Gastos fijos: plantilla mensual que se "causa" con 1 clic. Todo aditivo.

CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCop" INTEGER NOT NULL,
    "supplierName" TEXT,
    "dayOfMonth" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- Enlace del gasto causado a su plantilla (para saber qué meses ya se causaron).
ALTER TABLE "Expense" ADD COLUMN "recurringId" TEXT;
CREATE INDEX "Expense_recurringId_idx" ON "Expense"("recurringId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
