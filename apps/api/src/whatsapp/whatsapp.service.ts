import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get verifyToken(): string | undefined {
    return this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
  }

  /**
   * Verifica la firma `X-Hub-Signature-256` que Meta calcula con el App Secret
   * sobre el cuerpo crudo del request. Si no hay App Secret configurado (dev),
   * deja pasar con una advertencia.
   */
  verifySignature(raw: Buffer | undefined, signature?: string): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) {
      this.logger.warn('WHATSAPP_APP_SECRET sin configurar: la firma NO se verifica (solo dev)');
      return true;
    }
    if (!raw || !signature) return false;

    const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Persiste el evento entrante una sola vez (idempotencia por (source, externalId)).
   * En Fase 2 esto encolará el procesamiento por el orquestador de IA; por ahora
   * solo deja el evento registrado.
   */
  async persistEvent(payload: unknown, raw?: Buffer): Promise<{ duplicate: boolean }> {
    const externalId = this.deriveExternalId(payload, raw);
    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: 'WHATSAPP',
          externalId,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`Evento WhatsApp registrado: ${externalId}`);
      return { duplicate: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.debug(`Evento WhatsApp duplicado, ignorado: ${externalId}`);
        return { duplicate: true };
      }
      throw err;
    }
  }

  /** ID estable para deduplicar: el id del mensaje/estado de WhatsApp, o un hash del cuerpo. */
  private deriveExternalId(payload: unknown, raw?: Buffer): string {
    const value = (payload as { entry?: { changes?: { value?: WhatsappValue }[] }[] })?.entry?.[0]
      ?.changes?.[0]?.value;
    const id = value?.messages?.[0]?.id ?? value?.statuses?.[0]?.id;
    if (typeof id === 'string') return id;

    const buf = raw ?? Buffer.from(JSON.stringify(payload ?? {}));
    return 'sha256:' + createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Extrae los mensajes ENTRANTES (de clientes) de un payload de webhook de Meta.
   * Ignora los eventos de estado (delivered/read), que se manejan aparte.
   */
  extractInboundMessages(payload: unknown): InboundMessage[] {
    const entries = (payload as { entry?: WaEntry[] })?.entry ?? [];
    const out: InboundMessage[] = [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const contactName = value?.contacts?.[0]?.profile?.name ?? null;
        for (const m of value?.messages ?? []) {
          if (!m.id || !m.from) continue;
          const text =
            m.type === 'text'
              ? (m.text?.body ?? null)
              : ((m as Record<string, { caption?: string }>)[m.type ?? '']?.caption ?? null);
          out.push({
            from: m.from,
            wamId: m.id,
            type: m.type ?? 'unknown',
            text,
            contactName,
            raw: m,
          });
        }
      }
    }
    return out;
  }
}

export interface InboundMessage {
  from: string; // teléfono del cliente en formato Meta (E.164 sin +)
  wamId: string; // id único del mensaje de WhatsApp (para deduplicar)
  type: string; // text, image, audio, interactive, …
  text: string | null; // cuerpo si es texto, o caption si trae
  contactName: string | null; // nombre del perfil de WhatsApp, si viene
  raw: unknown;
}

interface WhatsappValue {
  messages?: { id?: string }[];
  statuses?: { id?: string }[];
}
interface WaEntry {
  changes?: { value?: WaValue }[];
}
interface WaValue {
  contacts?: { profile?: { name?: string } }[];
  messages?: WaMessage[];
}
interface WaMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
}
