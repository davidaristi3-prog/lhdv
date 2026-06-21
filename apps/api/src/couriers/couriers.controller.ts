import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CouriersService } from './couriers.service';
import { SetZoneRatesDto, UpdateCourierProfileDto } from './dto/courier.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Roles(UserRole.OWNER)
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriers: CouriersService) {}

  // El domiciliario consulta SU propio estado de cuenta. Declarado antes de
  // `:id` y con rol DELIVERY (sobrescribe el @Roles(OWNER) de la clase).
  @Roles(UserRole.DELIVERY, UserRole.OWNER)
  @Get('me/account')
  myAccount(@CurrentUser() user: JwtPayload) {
    return this.couriers.myAccount(user.sub);
  }

  @Get()
  list() {
    return this.couriers.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.couriers.get(id);
  }

  @Patch(':id')
  updateProfile(@Param('id') id: string, @Body() dto: UpdateCourierProfileDto) {
    return this.couriers.updateProfile(id, dto);
  }

  @Put(':id/zone-rates')
  setZoneRates(@Param('id') id: string, @Body() dto: SetZoneRatesDto) {
    return this.couriers.setZoneRates(id, dto);
  }
}
