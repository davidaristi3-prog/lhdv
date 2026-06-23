import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envío de mensajes salientes a WhatsApp vía Meta Graph API.
 * En "dry-run" (sin token configurado, o con WHATSAPP_DRY_RUN=true) NO envía nada: solo
 * loguea lo que enviaría. Esto permite construir y probar el orquestador sin spamear
 * números reales mientras los trámites de Meta (Fase 0) todavía no están listos.
 */
@Injectable()
export class WhatsappSenderService {
  private readonly logger = new Logger(WhatsappSenderService.name);

  constructor(private readonly config: ConfigService) {}

  private get dryRun(): boolean {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return this.config.get<string>('WHATSAPP_DRY_RUN') === 'true' || !token || !phoneId;
  }

  /** Envía un mensaje de texto libre (solo válido dentro de la ventana de 24h de Meta). */
  async sendText(toPhone: string, body: string): Promise<{ sent: boolean; dryRun: boolean }> {
    return this.send(toPhone, { type: 'text', text: { preview_url: false, body } });
  }

  /** Envía cualquier payload de mensaje de la Graph API (texto, plantilla, interactivo…). */
  async send(
    toPhone: string,
    message: Record<string, unknown>,
  ): Promise<{ sent: boolean; dryRun: boolean }> {
    if (this.dryRun) {
      this.logger.log(`[DRY-RUN] → ${toPhone}: ${JSON.stringify(message)}`);
      return { sent: false, dryRun: true };
    }
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: toPhone, ...message }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        this.logger.error(`Error enviando a ${toPhone}: ${res.status} ${err.slice(0, 250)}`);
        return { sent: false, dryRun: false };
      }
      return { sent: true, dryRun: false };
    } catch (err) {
      this.logger.error(`Fallo de red enviando a ${toPhone}: ${(err as Error).message}`);
      return { sent: false, dryRun: false };
    }
  }
}
