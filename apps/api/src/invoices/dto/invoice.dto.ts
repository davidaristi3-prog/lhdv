import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateInvoiceSettingsDto {
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() companyAddress?: string;
  @IsOptional() @IsString() companyContact?: string;
  @IsOptional() @IsString() sellerName?: string;
  @IsOptional() @IsString() sellerCC?: string;
  @IsOptional() @IsString() sellerRut?: string;
  @IsOptional() @IsString() paymentInfo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  nextNumber?: number; // desde qué consecutivo arranca
}
