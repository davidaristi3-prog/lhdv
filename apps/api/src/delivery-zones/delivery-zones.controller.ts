import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly zones: DeliveryZonesService) {}

  // Lectura: cualquier usuario autenticado (la usa el formulario de pedido).
  @Get()
  list(@Query('all') all?: string) {
    return this.zones.list(all === 'true');
  }

  @Roles(UserRole.OWNER)
  @Post()
  create(@Body() dto: CreateZoneDto) {
    return this.zones.create(dto);
  }

  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.zones.remove(id);
  }
}
