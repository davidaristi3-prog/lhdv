import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSenderService } from './whatsapp-sender.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappSenderService],
  exports: [WhatsappService, WhatsappSenderService],
})
export class WhatsappModule {}
