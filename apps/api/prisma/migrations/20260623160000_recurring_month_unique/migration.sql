-- Backstop anti-duplicado de gastos fijos: un gasto fijo no se puede causar dos
-- veces el mismo mes, ni siquiera con requests concurrentes (doble clic / 2 pestañas).
-- En Postgres un índice único permite múltiples filas con NULL, así que las compras
-- y gastos normales (recurringId/causedMonth NULL) no se ven afectados.

ALTER TABLE "Expense" ADD COLUMN "causedMonth" TEXT;
CREATE UNIQUE INDEX "Expense_recurringId_causedMonth_key" ON "Expense"("recurringId", "causedMonth");
