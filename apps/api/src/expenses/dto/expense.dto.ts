import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory } from '@prisma/client';

/** Renglón de insumo comprado: mueve inventario y recalcula el costo del insumo. */
export class ExpenseLineInput {
  @IsString()
  ingredientId!: string;

  @IsOptional()
  @IsString()
  packLabel?: string; // presentación informativa, ej. "2 Kilos"

  @IsNumber()
  @Min(0)
  qtyBase!: number; // cantidad ya convertida a la unidad base del insumo (g/ml/unidad)

  @IsInt()
  @Min(0)
  lineCop!: number; // lo que costó este renglón (total)
}

export class CreateExpenseDto {
  @IsISO8601()
  date!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  // Para una compra (con renglones) la descripción y el monto se derivan; para un
  // gasto normal el cliente los envía.
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountCop?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  invoiceNo?: string;

  @IsOptional()
  @IsString()
  supplierName?: string; // proveedor; se crea al vuelo si es nuevo

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseLineInput)
  lines?: ExpenseLineInput[]; // si viene con renglones, es una COMPRA de insumos
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountCop?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
