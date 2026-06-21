import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIngredientDto, RecipeItemInput, UpdateIngredientDto } from './dto/ingredient.dto';

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  listIngredients(includeInactive = false) {
    return this.prisma.ingredient.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  createIngredient(dto: CreateIngredientDto) {
    return this.prisma.ingredient.create({ data: dto });
  }

  updateIngredient(id: string, dto: UpdateIngredientDto) {
    return this.prisma.ingredient.update({ where: { id }, data: dto });
  }

  /** Receta de una presentación + su costo de insumos. */
  async getRecipe(variantId: string) {
    const items = await this.prisma.recipeItem.findMany({
      where: { productVariantId: variantId },
      include: { ingredient: true },
    });
    const costCop = Math.round(
      items.reduce((sum, i) => sum + i.quantity * i.ingredient.costPerUnitCop, 0),
    );
    return { variantId, items, costCop };
  }

  /** Reemplaza la receta de una presentación. */
  async setRecipe(variantId: string, items: RecipeItemInput[]) {
    await this.prisma.$transaction([
      this.prisma.recipeItem.deleteMany({ where: { productVariantId: variantId } }),
      ...items.map((i) =>
        this.prisma.recipeItem.create({
          data: { productVariantId: variantId, ingredientId: i.ingredientId, quantity: i.quantity },
        }),
      ),
    ]);
    return this.getRecipe(variantId);
  }

  /** Mapa productVariantId → costo de insumos (para los reportes de rentabilidad). */
  async costByVariant(): Promise<Map<string, number>> {
    const items = await this.prisma.recipeItem.findMany({ include: { ingredient: true } });
    const map = new Map<string, number>();
    for (const i of items) {
      map.set(
        i.productVariantId,
        (map.get(i.productVariantId) ?? 0) + i.quantity * i.ingredient.costPerUnitCop,
      );
    }
    return map;
  }

  // ─── Inventario ─────────────────────────────────────────────

  /** Registra una compra/entrada: suma al stock y deja el movimiento. */
  async purchase(id: string, quantity: number, notes: string | undefined, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ing = await tx.ingredient.update({
        where: { id },
        data: { stockQty: { increment: quantity } },
      });
      await tx.inventoryMovement.create({
        data: { ingredientId: id, type: 'PURCHASE', quantity, reason: notes, createdById: userId },
      });
      return ing;
    });
  }

  /** Ajuste manual: fija el stock a `quantity` (conteo real) y registra la diferencia. */
  async adjust(id: string, quantity: number, notes: string | undefined, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.ingredient.findUnique({ where: { id }, select: { stockQty: true } });
      if (!cur) throw new NotFoundException('Insumo no encontrado');
      const ing = await tx.ingredient.update({ where: { id }, data: { stockQty: quantity } });
      await tx.inventoryMovement.create({
        data: {
          ingredientId: id,
          type: 'ADJUSTMENT',
          quantity: Math.abs(quantity - cur.stockQty),
          reason: notes ?? `Ajuste a ${quantity}`,
          createdById: userId,
        },
      });
      return ing;
    });
  }

  listMovements(ingredientId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { ingredientId: ingredientId || undefined },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { ingredient: { select: { name: true, unit: true } } },
    });
  }
}
