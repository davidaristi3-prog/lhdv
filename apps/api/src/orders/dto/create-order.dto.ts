import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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

  // Borrador (confirm=false) admite ir sin productos; para cocina (confirm=true)
  // el servicio exige al menos uno.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsISO8601()
  deliveryDate?: string;

  // Dirección: por id de la agenda del cliente, o texto nuevo (con opción de guardarlo).
  @IsOptional()
  @IsString()
  customerAddressId?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryZone?: string;

  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;

  @IsOptional()
  @IsString()
  addressLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryCostCop?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Entrada manual: si es `true`, el pedido nace ya CONFIRMADO y aparece en el
   * tablero de cocina al instante. Si es `false`/ausente, queda en borrador para
   * terminar de armarlo. (El bot de WhatsApp nunca lo manda: siempre arma borrador.)
   */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  /** Si se setea, el pedido es sin cobro (regalo/garantía): total = 0, no genera ingreso. */
  @IsOptional()
  @IsIn(['GIFT', 'WARRANTY'])
  freeReason?: 'GIFT' | 'WARRANTY';
}
