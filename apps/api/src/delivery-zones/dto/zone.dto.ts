import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  deliveryCostCop!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryCostCop?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
