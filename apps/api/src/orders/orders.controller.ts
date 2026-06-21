import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: OrderStatus, @Query('date') date?: string) {
    return this.orders.list({ status, date });
  }

  @Get('board')
  board() {
    return this.orders.board();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orders.createManual(dto, user.sub);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orders.confirmManual(id, {
      byUserId: user.sub,
      reason: 'Enviado a cocina desde el panel',
    });
  }

  @Patch(':id/transition')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orders.applyTransition(id, dto.to, {
      byUserId: user.sub,
      reason: dto.reason,
      actingRole: user.role,
      scrap: dto.scrap,
    });
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orders.deleteDraft(id);
  }
}
