import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SettlementsService } from './settlements.service';
import { GenerateSettlementDto } from './dto/settlement.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

// Paths absolutos: las de "settlements" no cuelgan de /couriers/:id para evitar
// la colisión con GET /couriers/:id.
@Roles(UserRole.OWNER)
@Controller()
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('couriers/:courierId/settlements/preview')
  preview(
    @Param('courierId') courierId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settlements.preview(courierId, from, to);
  }

  @Post('couriers/:courierId/settlements')
  generate(
    @Param('courierId') courierId: string,
    @Body() dto: GenerateSettlementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.settlements.generate(courierId, dto, user.sub);
  }

  @Get('settlements')
  list(@Query('courierId') courierId?: string, @Query('status') status?: string) {
    return this.settlements.list(courierId, status);
  }

  @Get('settlements/:id')
  get(@Param('id') id: string) {
    return this.settlements.get(id);
  }

  @Patch('settlements/:id/pay')
  pay(@Param('id') id: string) {
    return this.settlements.markPaid(id);
  }
}
