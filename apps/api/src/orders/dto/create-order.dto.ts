import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryType, OrderChannel } from '@prisma/client';

export class OrderItemAdditionDto {
  @IsString()
  additionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class OrderItemDto {
  @IsString()
  productVariantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  customText?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemAdditionDto)
  additions?: OrderItemAdditionDto[];
}

export class CreateOrderDto {
  // Cliente: por id existente, o por whatsappPhone (+ name) para crearlo al vuelo.
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsEnum(OrderChannel)
  channel!: OrderChannel;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryZone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryCostCop?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
