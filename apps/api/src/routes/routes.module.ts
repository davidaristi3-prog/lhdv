import { Module } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [GeocodingModule, OrdersModule],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
