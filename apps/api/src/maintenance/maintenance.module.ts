import { Module } from '@nestjs/common';
import { PurgeService } from './purge.service';
import { MaintenanceController } from './maintenance.controller';

@Module({
  controllers: [MaintenanceController],
  providers: [PurgeService],
})
export class MaintenanceModule {}
