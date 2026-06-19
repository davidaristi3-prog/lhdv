import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ExpenseCategory } from '@prisma/client';

export class CreateExpenseDto {
  @IsISO8601()
  date!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(0)
  amountCop!: number;

  @IsOptional()
  @IsString()
  notes?: string;
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
