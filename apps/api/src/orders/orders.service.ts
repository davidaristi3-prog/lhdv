import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import {
  assertTransition,
  InvalidTransitionError,
  PRODUCTION_STATUSES,
  type OrderStatus,
} from '@lhdv/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

interface TransitionOptions {
  /** Usuario del panel que ejecuta el cambio. `null` = sistema (bot, webhook). */
  byUserId?: string | null;
  reason?: string;
  /** Rol del usuario que ejecuta, para aplicar restricciones (Ventas = solo consulta de cocina). */
  actingRole?: UserRole;
  /** Al volver de producción a confirmado: true = baja (merma, no repone inventario). */
  scrap?: boolean;
}

/** Estados que ve el tablero de cocina, en orden de flujo. */
const BOARD_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'OUT_FOR_DELIVERY',
];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Lectura ────────────────────────────────────────────────

  list(params: { status?: OrderStatus; date?: string } = {}) {
    return this.prisma.order.findMany({
      where: {
        status: params.status,
        deliveryDate: params.date ? this.dayRange(params.date) : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, whatsappPhone: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    });
  }

  /** Pedidos activos para el tablero de cocina (kanban). */
  board() {
    return this.prisma.order.findMany({
      where: { status: { in: BOARD_STATUSES } },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        customer: { select: { id: true, name: true, whatsappPhone: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    });
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: this.fullInclude(),
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  // ─── Creación manual (Fase 1) ───────────────────────────────

  async createManual(dto: CreateOrderDto, userId: string) {
    const items = dto.items ?? [];
    // Para enviar a cocina hace falta al menos un producto; un borrador puede ir vacío.
    if (dto.confirm && items.length === 0) {
      throw new BadRequestException('Para enviar a cocina agregá al menos un producto');
    }
    const customerId = await this.resolveCustomer(dto);

    // Cargar variantes y adiciones para fijar precios (snapshots).
    const { itemsData, subtotal } = await this.buildOrderItems(items);

    const deliveryCostCop = dto.deliveryCostCop ?? 0;
    const code = await this.nextOrderCode();
    const delivery = await this.resolveAddress(customerId, dto);

    // La persona que toma el pedido decide: mandarlo directo a cocina (CONFIRMED)
    // o dejarlo en borrador para terminar de armarlo.
    const initialStatus: OrderStatus = dto.confirm ? 'CONFIRMED' : 'DRAFT';

    return this.prisma.order.create({
      data: {
        code,
        channel: dto.channel,
        status: initialStatus,
        isCustom: dto.isCustom ?? false,
        deliveryType: dto.deliveryType,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        deliveryAddress: delivery.deliveryAddress,
        deliveryZone: delivery.deliveryZone,
        deliveryCostCop,
        subtotalCop: subtotal,
        totalCop: subtotal + deliveryCostCop,
        notes: dto.notes,
        customer: { connect: { id: customerId } },
        createdBy: { connect: { id: userId } },
        ...(delivery.customerAddressId
          ? { customerAddress: { connect: { id: delivery.customerAddressId } } }
          : {}),
        items: { create: itemsData },
        statusEvents: {
          create: {
            toStatus: initialStatus,
            byUserId: userId,
            reason: dto.confirm
              ? 'Creado y enviado a cocina manualmente'
              : 'Pedido creado manualmente',
          },
        },
      },
      include: this.fullInclude(),
    });
  }

  /** Calcula los OrderItem (con precios snapshot) y el subtotal a partir de los items del DTO. */
  private async buildOrderItems(items: CreateOrderDto['items']) {
    const list = items ?? [];
    const variantIds = list.map((i) => i.productVariantId);
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const additionIds = list.flatMap((i) => (i.additions ?? []).map((a) => a.additionId));
    const additions = additionIds.length
      ? await this.prisma.addition.findMany({ where: { id: { in: additionIds } } })
      : [];
    const additionById = new Map(additions.map((a) => [a.id, a]));

    let subtotal = 0;
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = list.map((item) => {
      const variant = variantById.get(item.productVariantId);
      if (!variant) throw new BadRequestException(`Variante ${item.productVariantId} no existe`);

      const itemAdditions = (item.additions ?? []).map((a) => {
        const addition = additionById.get(a.additionId);
        if (!addition) throw new BadRequestException(`Adición ${a.additionId} no existe`);
        return { additionId: addition.id, priceCop: addition.priceCop, quantity: a.quantity ?? 1 };
      });

      const additionsTotal = itemAdditions.reduce((s, a) => s + a.priceCop * a.quantity, 0);
      subtotal += variant.priceCop * item.quantity + additionsTotal;

      return {
        quantity: item.quantity,
        unitPriceCop: variant.priceCop,
        customText: item.customText,
        notes: item.notes,
        variant: { connect: { id: variant.id } },
        additions: { create: itemAdditions },
      };
    });
    return { itemsData, subtotal };
  }

  /**
   * Edita un borrador (solo DRAFT): reemplaza los items y actualiza cliente,
   * entrega y notas, recalculando precios. No cambia el código ni el estado.
   */
  async updateDraft(orderId: string, dto: CreateOrderDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!existing) throw new NotFoundException(`Pedido ${orderId} no existe`);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden editar pedidos en borrador');
    }

    const customerId = await this.resolveCustomer(dto);
    const { itemsData, subtotal } = await this.buildOrderItems(dto.items);
    const deliveryCostCop = dto.deliveryCostCop ?? 0;
    const delivery = await this.resolveAddress(customerId, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.update({
        where: { id: orderId },
        data: {
          isCustom: dto.isCustom ?? false,
          deliveryType: dto.deliveryType ?? null,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
          deliveryAddress: delivery.deliveryAddress ?? null,
          deliveryZone: delivery.deliveryZone ?? null,
          deliveryCostCop,
          subtotalCop: subtotal,
          totalCop: subtotal + deliveryCostCop,
          notes: dto.notes ?? null,
          customer: { connect: { id: customerId } },
          customerAddress: delivery.customerAddressId
            ? { connect: { id: delivery.customerAddressId } }
            : { disconnect: true },
          items: { create: itemsData },
        },
      });
    });
    return this.get(orderId);
  }

  // ─── Máquina de estados ─────────────────────────────────────

  /**
   * Cambia el estado de un pedido validando la transición contra la máquina de
   * estados compartida y registra el evento de auditoría. Todo en una transacción.
   */
  async applyTransition(orderId: string, to: OrderStatus, opts: TransitionOptions = {}) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException(`Pedido ${orderId} no existe`);

      const from = order.status as OrderStatus;

      // Ventas solo consulta la producción: no puede mover a estados de cocina/entrega.
      if (opts.actingRole === 'SALES' && PRODUCTION_STATUSES.includes(to)) {
        throw new ForbiddenException(
          'Ventas solo puede consultar el estado de producción, no cambiarlo',
        );
      }

      try {
        assertTransition(from, to);
      } catch (err) {
        if (err instanceof InvalidTransitionError) throw new BadRequestException(err.message);
        throw err;
      }

      const updated = await tx.order.update({ where: { id: orderId }, data: { status: to } });
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: to,
          byUserId: opts.byUserId ?? null,
          reason: opts.reason ?? null,
        },
      });

      // Inventario: al iniciar producción se descuentan los insumos según la receta
      // de cada producto del pedido (una sola vez, controlado por inventoryDeductedAt).
      // Se minimizan las queries —una sola lectura de recetas con `in`, un solo
      // createMany de movimientos— para no agotar el tiempo de la transacción
      // interactiva contra Postgres remoto (Neon).
      if (to === 'IN_PRODUCTION' && order.inventoryDeductedAt == null) {
        const orderItems = await tx.orderItem.findMany({
          where: { orderId },
          select: { quantity: true, productVariantId: true },
        });
        const variantIds = [...new Set(orderItems.map((it) => it.productVariantId))];
        const recipeItems = await tx.recipeItem.findMany({
          where: { productVariantId: { in: variantIds } },
          select: { productVariantId: true, ingredientId: true, quantity: true },
        });
        const recipeByVariant = new Map<string, { ingredientId: string; quantity: number }[]>();
        for (const r of recipeItems) {
          const list = recipeByVariant.get(r.productVariantId) ?? [];
          list.push({ ingredientId: r.ingredientId, quantity: r.quantity });
          recipeByVariant.set(r.productVariantId, list);
        }
        const consume = new Map<string, number>();
        for (const it of orderItems) {
          for (const r of recipeByVariant.get(it.productVariantId) ?? []) {
            consume.set(r.ingredientId, (consume.get(r.ingredientId) ?? 0) + r.quantity * it.quantity);
          }
        }
        if (consume.size > 0) {
          for (const [ingredientId, qty] of consume) {
            await tx.ingredient.update({
              where: { id: ingredientId },
              data: { stockQty: { decrement: qty } },
            });
          }
          await tx.inventoryMovement.createMany({
            data: [...consume].map(([ingredientId, qty]) => ({
              ingredientId,
              type: 'CONSUMPTION' as const,
              quantity: qty,
              orderId,
              reason: 'Producción',
            })),
          });
        }
        await tx.order.update({ where: { id: orderId }, data: { inventoryDeductedAt: new Date() } });
      }

      // Volver de producción a confirmado (devolver o dar de baja). En ambos casos
      // se limpia inventoryDeductedAt para que, al reentrar a producción, se vuelva
      // a descontar. "Devolver" repone los insumos (no se gastaron); "Baja" (scrap)
      // NO los repone: el producto salió mal y esa merma queda reflejada en el stock.
      if (to === 'CONFIRMED' && from === 'IN_PRODUCTION' && order.inventoryDeductedAt != null) {
        if (!opts.scrap) {
          const consumed = await tx.inventoryMovement.findMany({
            where: { orderId, type: 'CONSUMPTION' },
            select: { ingredientId: true, quantity: true },
          });
          for (const m of consumed) {
            await tx.ingredient.update({
              where: { id: m.ingredientId },
              data: { stockQty: { increment: m.quantity } },
            });
          }
          if (consumed.length > 0) {
            await tx.inventoryMovement.createMany({
              data: consumed.map((m) => ({
                ingredientId: m.ingredientId,
                type: 'ADJUSTMENT' as const,
                quantity: m.quantity,
                orderId,
                reason: 'Devuelto de producción',
              })),
            });
          }
        }
        await tx.order.update({ where: { id: orderId }, data: { inventoryDeductedAt: null } });
      }

      return updated;
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * Atajo de entrada manual: envía un pedido en borrador (o pendiente de
   * confirmación/pago, o escalado) directo a CONFIRMED para que entre a cocina,
   * sin recorrer los pasos del flujo del bot. Registra el evento de auditoría.
   */
  async confirmManual(orderId: string, opts: TransitionOptions = {}) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException(`Pedido ${orderId} no existe`);
      const from = order.status as OrderStatus;
      // Idempotente: si ya está en cocina o más adelante, no hace nada.
      if (from === 'CONFIRMED' || PRODUCTION_STATUSES.includes(from)) return order;

      const confirmable: OrderStatus[] = [
        'DRAFT',
        'PENDING_CONFIRMATION',
        'AWAITING_PAYMENT',
        'NEEDS_HUMAN',
      ];
      if (!confirmable.includes(from)) {
        throw new BadRequestException(`No se puede enviar a cocina un pedido en estado ${from}`);
      }

      // No se manda a cocina un pedido sin productos (caso típico: borrador a medio armar).
      const itemCount = await tx.orderItem.count({ where: { orderId } });
      if (itemCount === 0) {
        throw new BadRequestException('Agregá al menos un producto antes de enviar a cocina');
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED' },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: 'CONFIRMED',
          byUserId: opts.byUserId ?? null,
          reason: opts.reason ?? 'Enviado a cocina manualmente',
        },
      });
      return updated;
    });
  }

  /** Descarta (elimina) un borrador. Solo DRAFT, que no tocó nada; la cascada borra items y eventos. */
  async deleteDraft(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!order) throw new NotFoundException(`Pedido ${orderId} no existe`);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden descartar pedidos en borrador');
    }
    await this.prisma.order.delete({ where: { id: orderId } });
    return { deleted: true };
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async resolveCustomer(dto: CreateOrderDto): Promise<string> {
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer) throw new BadRequestException('El cliente indicado no existe');
      return customer.id;
    }
    if (dto.customerPhone) {
      const existing = await this.prisma.customer.findUnique({
        where: { whatsappPhone: dto.customerPhone },
      });
      if (existing) return existing.id;
      const created = await this.prisma.customer.create({
        data: { whatsappPhone: dto.customerPhone, name: dto.customerName },
      });
      return created.id;
    }
    throw new BadRequestException('Indicá customerId o customerPhone');
  }

  /** Resuelve la dirección: elegida de la agenda, o nueva (con opción de guardarla). */
  private async resolveAddress(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<{ deliveryAddress?: string; deliveryZone?: string; customerAddressId?: string }> {
    if (dto.customerAddressId) {
      const addr = await this.prisma.customerAddress.findUnique({
        where: { id: dto.customerAddressId },
      });
      if (!addr || addr.customerId !== customerId) {
        throw new BadRequestException('La dirección seleccionada no pertenece a este cliente');
      }
      return {
        deliveryAddress: addr.address,
        deliveryZone: addr.zone ?? undefined,
        customerAddressId: addr.id,
      };
    }

    if (dto.deliveryAddress) {
      let customerAddressId: string | undefined;
      if (dto.saveAddress) {
        const created = await this.prisma.customerAddress.create({
          data: {
            customerId,
            address: dto.deliveryAddress,
            zone: dto.deliveryZone,
            label: dto.addressLabel,
          },
        });
        customerAddressId = created.id;
      }
      return { deliveryAddress: dto.deliveryAddress, deliveryZone: dto.deliveryZone, customerAddressId };
    }

    return {};
  }

  private async nextOrderCode(): Promise<string> {
    // Basado en el código más alto existente, NO en count(): al borrar borradores
    // quedan huecos y count() reusaría un código ya usado (choca con el unique → P2002).
    const last = await this.prisma.order.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last ? parseInt(last.code.replace(/\D/g, ''), 10) || 0 : 0;
    return `LHDV-${String(lastNum + 1).padStart(4, '0')}`;
  }

  private dayRange(date: string): Prisma.DateTimeFilter {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }

  private fullInclude() {
    return {
      customer: true,
      createdBy: { select: { id: true, name: true } },
      customerAddress: true,
      items: {
        include: {
          variant: { include: { product: true } },
          additions: { include: { addition: true } },
        },
      },
      statusEvents: { orderBy: { createdAt: 'asc' as const } },
      payments: true,
    } satisfies Prisma.OrderInclude;
  }
}
