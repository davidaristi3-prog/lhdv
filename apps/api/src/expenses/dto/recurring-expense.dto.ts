import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory } from '@prisma/client';

export class CreateRecurringDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsInt()
  @Min(0)
  amountCop!: number;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRecurringDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountCop?: number;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Causar un gasto fijo: el monto se confirma/ajusta en el momento (debe ser > 0). */
export class CauseDto {
  @IsInt()
  @Min(1)
  amountCop!: number;

  @IsOptional()
  @IsISO8601()
  date?: string; // por defecto hoy
}

export class CauseBatchItem {
  @IsString()
  recurringId!: string;

  @IsInt()
  @Min(1)
  amountCop!: number;
}

export class CauseBatchDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CauseBatchItem)
  items!: CauseBatchItem[];
}
