import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappService } from './whatsapp.service';
import { Public } from '../auth/public.decorator';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  /** Verificación del webhook (Meta hace un GET al configurarlo). */
  @Public()
  @Get('webhook')
  verify(@Query() query: Record<string, string>): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token && token === this.whatsapp.verifyToken) {
      return challenge;
    }
    throw new ForbiddenException('Verificación de webhook fallida');
  }

  /** Recepción de eventos (mensajes, estados). Verifica firma e idempotencia. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ received: boolean }> {
    if (!this.whatsapp.verifySignature(req.rawBody, signature)) {
      throw new ForbiddenException('Firma inválida');
    }
    await this.whatsapp.persistEvent(req.body, req.rawBody);
    return { received: true };
  }
}
