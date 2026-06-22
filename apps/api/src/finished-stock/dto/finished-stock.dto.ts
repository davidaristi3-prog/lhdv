import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SetParDto {
  @IsInt()
  @Min(0)
  parStock!: number; // objetivo de stock (0 = no se mantiene en stock)
}

export class ProduceStockDto {
  @IsInt()
  @Min(1)
  quantity!: number; // cuántas unidades se produjeron para stock

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdjustStockDto {
  @IsInt()
  @Min(0)
  quantity!: number; // nuevo valor de existencias listas (conteo real)

  @IsOptional()
  @IsString()
  notes?: string;
}
