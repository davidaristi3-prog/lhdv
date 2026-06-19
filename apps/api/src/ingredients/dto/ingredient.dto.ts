import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIngredientDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  unit!: string; // 'g', 'ml', 'unidad'

  @IsNumber()
  @Min(0)
  costPerUnitCop!: number;
}

export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerUnitCop?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class RecipeItemInput {
  @IsString()
  ingredientId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}

export class SetRecipeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeItemInput)
  items!: RecipeItemInput[];
}
