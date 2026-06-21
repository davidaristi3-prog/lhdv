-- Order.code pasa a opcional: un borrador no consume número del consecutivo;
-- el código (LHDV-XXXX) se asigna al enviar el pedido a cocina (CONFIRMED).
ALTER TABLE "Order" ALTER COLUMN "code" DROP NOT NULL;
