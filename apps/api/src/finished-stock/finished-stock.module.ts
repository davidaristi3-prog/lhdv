import { Module } from '@nestjs/common';
import { FinishedStockService } from './finished-stock.service';
import { FinishedStockController } from './finished-stock.controller';

@Module({
  controllers: [FinishedStockController],
  providers: [FinishedStockService],
  exports: [FinishedStockService], // lo usará OrdersModule para consumir/devolver stock (Fase 2)
})
export class FinishedStockModule {}
