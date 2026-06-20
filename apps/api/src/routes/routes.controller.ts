import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RoutesService } from './routes.service';
import { CreateRouteDto, DeliveredDto, LocationDto } from './dto/route.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Roles(UserRole.OWNER)
  @Get('available')
  available() {
    return this.routes.availableOrders();
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Get('mine')
  mine(@CurrentUser() user: JwtPayload) {
    return this.routes.myActiveRoute(user.sub);
  }

  @Roles(UserRole.OWNER)
  @Get()
  list() {
    return this.routes.list();
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.routes.get(id);
  }

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateRouteDto) {
    return this.routes.create(dto);
  }

  @Roles(UserRole.OWNER)
  @Post(':id/reorder')
  reorder(@Param('id') id: string) {
    return this.routes.reorder(id);
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.routes.start(id, user.sub, user.role);
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post(':id/location')
  location(@Param('id') id: string, @Body() dto: LocationDto) {
    return this.routes.updateLocation(id, dto.lat, dto.lng);
  }

  @Roles(UserRole.OWNER, UserRole.DELIVERY)
  @Post('orders/:orderId/delivered')
  delivered(
    @Param('orderId') orderId: string,
    @Body() dto: DeliveredDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.routes.markDelivered(orderId, { userId: user.sub, role: user.role, notes: dto.notes });
  }
}
