import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IngredientsService } from './ingredients.service';
import {
  AdjustDto,
  CreateIngredientDto,
  PurchaseDto,
  SetRecipeDto,
  UpdateIngredientDto,
} from './dto/ingredient.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Roles(UserRole.OWNER)
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get()
  list(@Query('all') all?: string) {
    return this.ingredients.listIngredients(all === 'true');
  }

  @Get('movements')
  movements(@Query('ingredientId') ingredientId?: string) {
    return this.ingredients.listMovements(ingredientId);
  }

  @Post(':id/purchase')
  purchase(@Param('id') id: string, @Body() dto: PurchaseDto, @CurrentUser() user: JwtPayload) {
    return this.ingredients.purchase(id, dto.quantity, dto.notes, user.sub);
  }

  @Post(':id/adjust')
  adjust(@Param('id') id: string, @Body() dto: AdjustDto, @CurrentUser() user: JwtPayload) {
    return this.ingredients.adjust(id, dto.quantity, dto.notes, user.sub);
  }

  @Post()
  create(@Body() dto: CreateIngredientDto) {
    return this.ingredients.createIngredient(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.ingredients.updateIngredient(id, dto);
  }

  @Get('recipe/:variantId')
  getRecipe(@Param('variantId') variantId: string) {
    return this.ingredients.getRecipe(variantId);
  }

  @Put('recipe/:variantId')
  setRecipe(@Param('variantId') variantId: string, @Body() dto: SetRecipeDto) {
    return this.ingredients.setRecipe(variantId, dto.items);
  }
}
