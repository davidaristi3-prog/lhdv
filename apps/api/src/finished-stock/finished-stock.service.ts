import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinishedStockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas las presentaciones activas con su par/listos (para el módulo de stock). */
  list() {
    return this.prisma.productVariant.findMany({
      where: { active: true, product: { active: true } },
      select: {
        id: true,
        name: true,
        priceCop: true,
        parStock: true,
        readyStock: true,
        product: { select: { name: true, category: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
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

      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { readyStock: quantity },
      });
      await tx.finishedStockMovement.create({
        data: {
          productVariantId: variantId,
          type: 'ADJUSTMENT',
          quantity: Math.abs(quantity - cur.readyStock),
          reason: notes ?? `Ajuste a ${quantity}`,
          createdById: userId,
        },
      });
      return variant;
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
}
