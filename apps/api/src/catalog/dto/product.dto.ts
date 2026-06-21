import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacityLoad?: number;

  @IsInt()
  @Min(0)
  priceCop!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wholesalePriceCop?: number;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isSeasonal?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isSeasonal?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacityLoad?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCop?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wholesalePriceCop?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateAdditionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  priceCop!: number;
}

export class UpdateAdditionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCop?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
