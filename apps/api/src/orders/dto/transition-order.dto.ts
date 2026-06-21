import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class TransitionOrderDto {
  @IsEnum(OrderStatus)
  to!: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Solo al volver de producción a confirmado: true = dar de baja (merma, NO
   *  repone inventario); false/ausente = devolver (repone los insumos). */
  @IsOptional()
  @IsBoolean()
  scrap?: boolean;
}
