import { Injectable } from '@nestjs/common';
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
}
