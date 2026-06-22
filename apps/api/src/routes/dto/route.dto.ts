import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRouteDto {
  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsString()
  courierId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderIds!: string[];
}

export class LocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class DeliveredDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddOrdersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderIds!: string[];
}

/** "No entregado": a dónde va el pedido devuelto a la planta. */
export class ReturnOrderDto {
  @IsIn(['stock', 'reschedule'])
  mode!: 'stock' | 'reschedule';

  @IsOptional()
  @IsString()
  notes?: string;
}
