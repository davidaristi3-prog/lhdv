import { Controller, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GeocodingService } from './geocoding.service';
import { Roles } from '../auth/roles.decorator';

@Roles(UserRole.OWNER)
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Post('backfill')
  backfill() {
    return this.geocoding.backfill();
  }

  @Post('address/:id')
  one(@Param('id') id: string) {
    return this.geocoding.geocodeAddress(id);
  }
}
