import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FinishedStockService } from './finished-stock.service';
import { AdjustStockDto, ProduceStockDto, SetParDto } from './dto/finished-stock.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Roles(UserRole.OWNER)
@Controller('finished-stock')
export class FinishedStockController {
  constructor(private readonly stock: FinishedStockService) {}

  @Get()
  list() {
    return this.stock.list();
  }

  @Get('movements')
  movements(@Query('variantId') variantId?: string) {
    return this.stock.listMovements(variantId);
  }

  @Patch(':variantId/par')
  setPar(@Param('variantId') variantId: string, @Body() dto: SetParDto) {
    return this.stock.setPar(variantId, dto.parStock);
  }

  @Post(':variantId/produce')
  produce(
    @Param('variantId') variantId: string,
    @Body() dto: ProduceStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stock.produce(variantId, dto.quantity, dto.notes, user.sub);
  }

  @Post(':variantId/adjust')
  adjust(
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stock.adjust(variantId, dto.quantity, dto.notes, user.sub);
  }
}
