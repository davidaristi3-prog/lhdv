-- Pedido sin cobro (regalo/garantía): mueve inventario pero no genera ingreso.
ALTER TABLE "Order" ADD COLUMN "freeReason" TEXT;

-- Evidencia opcional en un evento de estado (p.ej. foto al dar de baja un producto).
ALTER TABLE "OrderStatusEvent" ADD COLUMN "photoPath" TEXT;
