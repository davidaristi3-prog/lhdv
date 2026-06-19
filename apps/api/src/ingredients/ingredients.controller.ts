import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IngredientsService } from './ingredients.service';
import {
  CreateIngredientDto,
  SetRecipeDto,
  UpdateIngredientDto,
} from './dto/ingredient.dto';
import { Roles } from '../auth/roles.decorator';

@Roles(UserRole.OWNER)
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get()
  list(@Query('all') all?: string) {
    return this.ingredients.listIngredients(all === 'true');
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
