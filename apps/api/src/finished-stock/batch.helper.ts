import { Prisma } from '@prisma/client';

/** Crea un lote de producto terminado con su vencimiento (según la vida útil del producto). */
export async function createStockBatch(
  tx: Prisma.TransactionClient,
  productVariantId: string,
  quantity: number,
  userId?: string | null,
) {
  const variant = await tx.productVariant.findUnique({
    where: { id: productVariantId },
    select: { product: { select: { shelfLifeDays: true } } },
  });
  const days = variant?.product?.shelfLifeDays ?? null;
  const expiresAt = days != null && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  await tx.stockBatch.create({
    data: { productVariantId, quantity, expiresAt, createdById: userId ?? null },
  });
}

/**
 * Consume `qty` unidades de los lotes VIGENTES (no vencidos) de una presentación, FIFO
 * por vencimiento (lo que vence primero sale primero). Devuelve cuántas alcanzó a cubrir.
 * No toca ProductVariant.readyStock — eso lo ajusta quien llama.
 */
export async function consumeFromBatches(
  tx: Prisma.TransactionClient,
  productVariantId: string,
  qty: number,
): Promise<number> {
  const now = new Date();
  const batches = await tx.stockBatch.findMany({
    where: {
      productVariantId,
      quantity: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ expiresAt: 'asc' }, { producedAt: 'asc' }],
  });
  let remaining = qty;
  for (const b of batches) {
    if (remaining <= 0) break;
    const use = Math.min(b.quantity, remaining);
    await tx.stockBatch.update({ where: { id: b.id }, data: { quantity: { decrement: use } } });
    remaining -= use;
  }
  return qty - remaining;
}
