import { Controller, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PurgeService } from './purge.service';
import { Roles } from '../auth/roles.decorator';

@Roles(UserRole.OWNER)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly purge: PurgeService) {}

  /** Dispara la purga manualmente (?hours= para ajustar el umbral). */
  @Post('purge-photos')
  purgePhotos(@Query('hours') hours?: string) {
    return this.purge.purgeOldPhotos(hours != null ? Number(hours) : undefined);
  }
}
