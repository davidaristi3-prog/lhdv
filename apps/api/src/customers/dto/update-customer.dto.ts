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

  @IsOptional()
  @IsString()
  taxId?: string; // CC o NIT (para cuenta de cobro)

  @IsOptional()
  @IsString()
  whatsappPhone?: string; // permitir corregir el celular
}
