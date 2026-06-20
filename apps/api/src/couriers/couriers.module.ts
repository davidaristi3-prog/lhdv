import { Module } from '@nestjs/common';
import { CouriersController } from './couriers.controller';
import { CouriersService } from './couriers.service';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  controllers: [CouriersController, SettlementsController],
  providers: [CouriersService, SettlementsService],
})
export class CouriersModule {}
