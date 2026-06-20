import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { SettlementPeriod } from '@prisma/client';

export class GenerateSettlementDto {
  @IsEnum(SettlementPeriod)
  period!: SettlementPeriod;

  @IsISO8601()
  from!: string; // YYYY-MM-DD

  @IsISO8601()
  to!: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  notes?: string;
}
