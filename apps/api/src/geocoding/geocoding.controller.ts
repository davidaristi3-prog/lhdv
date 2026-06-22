import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GeocodingService } from './geocoding.service';
import { Roles } from '../auth/roles.decorator';

@Roles(UserRole.OWNER)
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  /** Verifica que la API key de Google esté activa (geocoding + directions). */
  @Get('diagnose')
  diagnose() {
    return this.geocoding.diagnose();
  }

  /** Geocodifica las pendientes; con ?force=true rehace TODAS con el proveedor actual. */
  @Post('backfill')
  backfill(@Query('force') force?: string) {
    return this.geocoding.backfill(force === 'true');
  }

  @Post('address/:id')
  one(@Param('id') id: string) {
    return this.geocoding.geocodeAddress(id);
  }
}
