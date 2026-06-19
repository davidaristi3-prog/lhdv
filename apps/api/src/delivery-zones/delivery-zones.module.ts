import { Module } from '@nestjs/common';
import { DeliveryZonesService } from './delivery-zones.service';
import { DeliveryZonesController } from './delivery-zones.controller';

@Module({
  controllers: [DeliveryZonesController],
  providers: [DeliveryZonesService],
})
export class DeliveryZonesModule {}
