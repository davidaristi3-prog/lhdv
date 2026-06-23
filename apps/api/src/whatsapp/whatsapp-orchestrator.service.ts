import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { formatCop } from '@lhdv/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { OrdersService } from '../orders/orders.service';

const BOT_EMAIL = 'bot@lahoradelvenado.co';

/**
 * Cerebro del bot de WhatsApp. Claude (tool use en loop) interpreta el mensaje del cliente
 * y arma el pedido llamando a tools que envuelven los servicios REALES (catálogo, zonas,
 * motor de pedidos). NUNCA hace aritmética: todo número sale de una tool con snapshots.
 * Crea el pedido SIEMPRE como BORRADOR (Nivel 2: una persona lo confirma).
 *
 * Se usa primero desde el SIMULADOR (sin WhatsApp) para ajustar la conversación; la misma
 * lógica servirá luego al worker de WhatsApp.
 */
@Injectable()
export class WhatsappOrchestratorService {
  private readonly logger = new Logger(WhatsappOrchestratorService.name);
  private client: Anthropic | null = null;
  // Estado de conversación en memoria por sesión (para el simulador; en prod será Redis/DB).
  private readonly sessions = new Map<string, Anthropic.MessageParam[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
  ) {}

  private get anthropic(): Anthropic {
    if (!this.client) {
      const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY: cargá la clave de Claude en el entorno.');
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  /** Usuario "Bot WhatsApp" (createManual exige un userId no nulo). Idempotente. */
  private async systemUserId(): Promise<string> {
    const found = await this.prisma.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true } });
    if (found) return found.id;
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10); // nunca se usa para login
    const u = await this.prisma.user.create({
      data: { name: 'Bot WhatsApp', email: BOT_EMAIL, passwordHash, role: 'SALES', active: false },
    });
    return u.id;
  }

  /** Punto de entrada del SIMULADOR: mantiene el hilo por sessionId y devuelve la respuesta del bot. */
  async simulate(sessionId: string, customerPhone: string, userText: string): Promise<{ reply: string }> {
    const history = this.sessions.get(sessionId) ?? [];
    const { reply, messages } = await this.handleTurn(customerPhone, history, userText);
    this.sessions.set(sessionId, messages);
    return { reply };
  }

  /** Reinicia una conversación del simulador. */
  resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Corre un turno completo: loop de tool use hasta que Claude responde texto al cliente. */
  async handleTurn(
    customerPhone: string,
    history: Anthropic.MessageParam[],
    userText: string,
  ): Promise<{ reply: string; messages: Anthropic.MessageParam[] }> {
    const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userText }];
    const model = this.config.get<string>('LLM_MODEL') ?? 'claude-opus-4-8';

    for (let step = 0; step < 8; step++) {
      const res = await this.anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: this.systemPrompt(),
        tools: this.toolDefs(),
        messages,
      });
      messages.push({ role: 'assistant', content: res.content });

      if (res.stop_reason !== 'tool_use') {
        const reply = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return { reply: reply || '🤍', messages };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        let result: unknown;
        try {
          result = await this.runTool(block.name, block.input as Record<string, unknown>, customerPhone);
        } catch (err) {
          result = { error: (err as Error).message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return {
      reply: 'Disculpá, se me complicó procesar esto. Ya te paso con una persona del equipo. 🤍',
      messages,
    };
  }

  // ─── System prompt ───────────────────────────────────────────
  private systemPrompt(): string {
    return [
      'Sos la asistente de "La Hora del Venado", una repostería artesanal de Medellín (Colombia).',
      'Atendés por WhatsApp con calidez, en español colombiano cercano (voseo o tuteo natural), con emojis con moderación. Sos breve y clara.',
      '',
      'TU TRABAJO: tomar pedidos ESTÁNDAR del catálogo y dejarlos como borrador para que una persona los confirme.',
      '',
      'REGLAS DURAS (no las rompas nunca):',
      '1. NUNCA inventes precios, totales, costos de domicilio ni disponibilidad. Cada número sale SIEMPRE de una tool. Si no llamaste la tool, no des el dato.',
      '2. Antes de crear el pedido mostrá un RESUMEN claro (productos, tamaños, cantidades, fecha, entrega/dirección, costo de domicilio y TOTAL) y esperá un "sí/confirmo" explícito del cliente. Sin confirmación, no llames crear_pedido_borrador.',
      '3. Solo cerrás pedidos ESTÁNDAR del catálogo. Si piden torta personalizada (con letras, fotos, diseños), reclamos, cambios, o algo fuera del catálogo: decí amablemente que ya los pasás con una persona del equipo y NO sigas armando el pedido.',
      '4. Para mapear lo que pide el cliente a un producto y tamaño reales, usá ver_catalogo y elegí el variante_id correcto. Si hay ambigüedad de sabor/tamaño, preguntá.',
      '5. Si es domicilio, necesitás la dirección; consultá ver_zonas para el costo según la zona. Si no identificás la zona, preguntá el barrio/sector.',
      '',
      'Arrancá saludando cálido y preguntando en qué le ayudás. Mantené el foco en cerrar el pedido.',
    ].join('\n');
  }

  // ─── Tools ───────────────────────────────────────────────────
  private toolDefs(): Anthropic.Tool[] {
    return [
      {
        name: 'ver_catalogo',
        description:
          'Devuelve el catálogo real: productos, sus tamaños/presentaciones (cada uno con su variante_id y precio) y las adiciones. Usalo para saber qué hay, los precios y los variante_id válidos.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'ver_zonas',
        description: 'Devuelve las zonas de domicilio con su costo, para cotizar el domicilio según el sector del cliente.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'crear_pedido_borrador',
        description:
          'Crea el pedido como BORRADOR (no lo cobra ni lo manda a cocina; lo confirma una persona). Llamalo SOLO después de que el cliente confirmó el resumen.',
        input_schema: {
          type: 'object',
          properties: {
            nombre_cliente: { type: 'string', description: 'nombre del cliente, si lo dio' },
            tipo_entrega: { type: 'string', enum: ['recoge', 'domicilio'] },
            direccion: { type: 'string', description: 'requerido si tipo_entrega = domicilio' },
            zona: { type: 'string', description: 'nombre de la zona de domicilio (de ver_zonas)' },
            costo_domicilio: { type: 'number', description: 'costo del domicilio en COP (de ver_zonas)' },
            fecha_entrega: { type: 'string', description: 'fecha de entrega en formato YYYY-MM-DD, si la dieron' },
            productos: {
              type: 'array',
              description: 'líneas del pedido',
              items: {
                type: 'object',
                properties: {
                  variante_id: { type: 'string', description: 'id de la variante (de ver_catalogo)' },
                  cantidad: { type: 'number' },
                  nota: { type: 'string', description: 'observación del producto, ej. "feliz cumpleaños"' },
                },
                required: ['variante_id', 'cantidad'],
              },
            },
            nota_pedido: { type: 'string', description: 'observación general del pedido' },
          },
          required: ['tipo_entrega', 'productos'],
        },
      },
    ];
  }

  private async runTool(name: string, input: Record<string, unknown>, customerPhone: string): Promise<unknown> {
    switch (name) {
      case 'ver_catalogo':
        return this.toolCatalogo();
      case 'ver_zonas':
        return this.toolZonas();
      case 'crear_pedido_borrador':
        return this.toolCrearPedido(input, customerPhone);
      default:
        return { error: `Tool desconocida: ${name}` };
    }
  }

  private async toolCatalogo() {
    const [products, additions] = await Promise.all([this.catalog.products(), this.catalog.additions()]);
    return {
      productos: products.map((p) => ({
        nombre: p.name,
        categoria: p.category,
        tamanos: p.variants
          .filter((v) => v.active)
          .map((v) => ({ variante_id: v.id, tamano: v.name, precio: v.priceCop, precio_texto: formatCop(v.priceCop) })),
      })),
      adiciones: additions.map((a) => ({ nombre: a.name, precio: a.priceCop, precio_texto: formatCop(a.priceCop) })),
    };
  }

  private async toolZonas() {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { active: true },
      select: { name: true, deliveryCostCop: true, aliases: true },
      orderBy: { name: 'asc' },
    });
    return zones.map((z) => ({
      zona: z.name,
      costo: z.deliveryCostCop,
      costo_texto: formatCop(z.deliveryCostCop),
      tambien_conocida_como: z.aliases,
    }));
  }

  private async toolCrearPedido(input: Record<string, unknown>, customerPhone: string) {
    const userId = await this.systemUserId();
    const tipo = input.tipo_entrega === 'domicilio' ? 'OWN_COURIER' : 'PICKUP';
    const productos = (input.productos as { variante_id: string; cantidad: number; nota?: string }[]) ?? [];
    if (productos.length === 0) return { error: 'El pedido no tiene productos.' };

    const order = await this.orders.createManual(
      {
        customerPhone,
        customerName: (input.nombre_cliente as string) || undefined,
        channel: 'WHATSAPP',
        confirm: false, // SIEMPRE borrador
        deliveryType: tipo,
        deliveryAddress: (input.direccion as string) || undefined,
        deliveryZone: (input.zona as string) || undefined,
        deliveryCostCop: typeof input.costo_domicilio === 'number' ? input.costo_domicilio : undefined,
        deliveryDate: input.fecha_entrega
          ? new Date(`${String(input.fecha_entrega)}T12:00:00`).toISOString()
          : undefined,
        notes: (input.nota_pedido as string) || undefined,
        items: productos.map((p) => ({
          productVariantId: p.variante_id,
          quantity: Number(p.cantidad) || 1,
          customText: p.nota || undefined,
        })),
      },
      userId,
    );
    this.logger.log(`Bot creó borrador ${order.id} (total ${formatCop(order.totalCop)})`);
    return {
      ok: true,
      mensaje: 'Pedido creado como BORRADOR. Una persona del equipo lo confirma enseguida.',
      total: order.totalCop,
      total_texto: formatCop(order.totalCop),
    };
  }
}
