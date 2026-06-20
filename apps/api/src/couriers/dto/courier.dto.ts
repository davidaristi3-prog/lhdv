import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CourierVehicle } from '@prisma/client';

export class UpdateCourierProfileDto {
  @IsOptional()
  @IsEnum(CourierVehicle)
  vehicle?: CourierVehicle;

  // number = tope de carga; null = sin límite (se permite para limpiarlo).
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  capacityLimit?: number | null;
}

class ZoneRateInput {
  @IsString()
  zoneId!: string;

  @IsInt()
  @Min(0)
  payCop!: number;
}

export class SetZoneRatesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZoneRateInput)
  rates!: ZoneRateInput[];
}
