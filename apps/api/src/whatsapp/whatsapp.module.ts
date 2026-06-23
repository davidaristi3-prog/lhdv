import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { WhatsappOrchestratorService } from './whatsapp-orchestrator.service';
import { OrdersModule } from '../orders/orders.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [OrdersModule, CatalogModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappSenderService, WhatsappOrchestratorService],
  exports: [WhatsappService, WhatsappSenderService, WhatsappOrchestratorService],
})
export class WhatsappModule {}
