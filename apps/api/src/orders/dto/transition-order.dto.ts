import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class TransitionOrderDto {
  @IsEnum(OrderStatus)
  to!: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
