import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createStockBatch, consumeFromBatches } from './batch.helper';

@Injectable()
export class FinishedStockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas las presentaciones activas con su par/listos (para el módulo de stock). */
  async list() {
    const variants = await this.prisma.productVariant.findMany({
      where: { active: true, product: { active: true } },
      select: {
        id: true,
        name: true,
        priceCop: true,
        parStock: true,
        readyStock: true,
        product: { select: { name: true, category: true, shelfLifeDays: true } },
        stockBatches: { where: { quantity: { gt: 0 } }, select: { quantity: true, expiresAt: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
    });
    const now = Date.now();
    const soon = now + 86_400_000; // 1 día
    return variants.map(({ stockBatches, product, ...rest }) => {
      let expired = 0; // unidades ya vencidas (no vendibles)
      let expiringSoon = 0; // vencen en <= 1 día
      let nextExpiryMs: number | null = null;
      for (const b of stockBatches) {
        if (!b.expiresAt) continue;
        const t = new Date(b.expiresAt).getTime();
        if (t <= now) expired += b.quantity;
        else if (t <= soon) expiringSoon += b.quantity;
        if (nextExpiryMs === null || t < nextExpiryMs) nextExpiryMs = t;
      }
      return {
        ...rest,
        product: { name: product.name, category: product.category },
        shelfLifeDays: product.shelfLifeDays,
        expired,
        expiringSoon,
        nextExpiry: nextExpiryMs ? new Date(nextExpiryMs).toISOString() : null,
      };
    });
  }

  /** Fija el objetivo de stock (par) de una presentación. */
  async setPar(variantId: string, parStock: number) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Presentación no encontrada');
    return this.prisma.productVariant.update({ where: { id: variantId }, data: { parStock } });
  }

  /**
   * Registra producción para stock: suma a las existencias listas y descuenta los
   * insumos de la receta (× cantidad). Es lo mismo que hornear, pero para tener
   * listo por adelantado en vez de para un pedido puntual.
   */
  async produce(variantId: string, quantity: number, notes: string | undefined, userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!variant) throw new NotFoundException('Presentación no encontrada');

        await tx.productVariant.update({
          where: { id: variantId },
          data: { readyStock: { increment: quantity } },
        });
        await createStockBatch(tx, variantId, quantity, userId);

        const recipe = await tx.recipeItem.findMany({
          where: { productVariantId: variantId },
          select: { ingredientId: true, quantity: true },
        });
        if (recipe.length > 0) {
          for (const r of recipe) {
            await tx.ingredient.update({
              where: { id: r.ingredientId },
              data: { stockQty: { decrement: r.quantity * quantity } },
            });
          }
          await tx.inventoryMovement.createMany({
            data: recipe.map((r) => ({
              ingredientId: r.ingredientId,
              type: 'CONSUMPTION' as const,
              quantity: r.quantity * quantity,
              reason: `Producción para stock (×${quantity})`,
              createdById: userId,
            })),
          });
        }

        await tx.finishedStockMovement.create({
          data: {
            productVariantId: variantId,
            type: 'PRODUCTION',
            quantity,
            reason: notes,
            createdById: userId,
          },
        });

        return tx.productVariant.findUnique({ where: { id: variantId } });
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }

  /**
   * Ajuste manual de las existencias listas (conteo físico). No toca insumos: solo
   * corrige el número de productos terminados disponibles.
   */
  async adjust(variantId: string, quantity: number, notes: string | undefined, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { readyStock: true },
      });
      if (!cur) throw new NotFoundException('Presentación no encontrada');

      const diff = quantity - cur.readyStock;
      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { readyStock: quantity },
      });
      // Ajusta los lotes para que cuadren con el conteo: si subió, nuevo lote; si bajó, FIFO.
      if (diff > 0) await createStockBatch(tx, variantId, diff, userId);
      else if (diff < 0) await consumeFromBatches(tx, variantId, -diff);
      await tx.finishedStockMovement.create({
        data: {
          productVariantId: variantId,
          type: 'ADJUSTMENT',
          quantity: Math.abs(diff),
          reason: notes ?? `Ajuste a ${quantity}`,
          createdById: userId,
        },
      });
      return variant;
    });
  }

  /** Da de baja (merma) los lotes vencidos de una presentación. */
  async scrapExpired(variantId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.stockBatch.findMany({
        where: { productVariantId: variantId, quantity: { gt: 0 }, expiresAt: { lte: new Date() } },
        select: { id: true, quantity: true },
      });
      const total = expired.reduce((s, b) => s + b.quantity, 0);
      if (total === 0) return { scrapped: 0 };
      await tx.stockBatch.deleteMany({ where: { id: { in: expired.map((b) => b.id) } } });
      await tx.productVariant.update({
        where: { id: variantId },
        data: { readyStock: { decrement: total } },
      });
      await tx.finishedStockMovement.create({
        data: {
          productVariantId: variantId,
          type: 'ADJUSTMENT',
          quantity: total,
          reason: 'Baja por vencimiento',
          createdById: userId,
        },
      });
      return { scrapped: total };
    });
  }

  listMovements(variantId?: string) {
    return this.prisma.finishedStockMovement.findMany({
      where: { productVariantId: variantId || undefined },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { variant: { select: { name: true, product: { select: { name: true } } } } },
    });
  }

  /** Cliente interno para los pedidos de producción de stock (no es un cliente real). */
  private async plantCustomerId(): Promise<string> {
    const phone = 'PLANTA-INTERNA';
    const existing = await this.prisma.customer.findUnique({ where: { whatsappPhone: phone } });
    if (existing) return existing.id;
    const created = await this.prisma.customer.create({
      data: { whatsappPhone: phone, name: '🏭 Producción (stock)' },
    });
    return created.id;
  }

  /**
   * Crea un pedido de producción para reponer stock: entra a cocina como un pedido más
   * (CONFIRMED), sin cliente real ni consecutivo. Al marcarlo Listo, sus unidades suman
   * al stock terminado (lo maneja OrdersService.applyTransition).
   */
  async createProductionOrder(variantId: string, quantity: number, userId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { priceCop: true },
    });
    if (!variant) throw new NotFoundException('Presentación no encontrada');
    const customerId = await this.plantCustomerId();
    return this.prisma.order.create({
      data: {
        code: null,
        channel: 'MANUAL',
        status: 'CONFIRMED',
        isStockProduction: true,
        customer: { connect: { id: customerId } },
        createdBy: { connect: { id: userId } },
        subtotalCop: 0,
        totalCop: 0,
        items: { create: [{ quantity, unitPriceCop: variant.priceCop, productVariantId: variantId }] },
        statusEvents: { create: { toStatus: 'CONFIRMED', byUserId: userId, reason: 'Producción para stock' } },
      },
    });
  }
}
