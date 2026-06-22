import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number; // % de descuento del cliente (mayorista)
}
