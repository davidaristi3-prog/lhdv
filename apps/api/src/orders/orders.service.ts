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
    const customerId = await this.resolveCustomer(dto);

    // Cargar variantes y adiciones para fijar precios (snapshots).
    const variantIds = dto.items.map((i) => i.productVariantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const additionIds = dto.items.flatMap((i) => (i.additions ?? []).map((a) => a.additionId));
    const additions = additionIds.length
      ? await this.prisma.addition.findMany({ where: { id: { in: additionIds } } })
      : [];
    const additionById = new Map(additions.map((a) => [a.id, a]));

    let subtotal = 0;
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = dto.items.map((item) => {
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

    const deliveryCostCop = dto.deliveryCostCop ?? 0;
    const code = await this.nextOrderCode();
    const delivery = await this.resolveAddress(customerId, dto);

    return this.prisma.order.create({
      data: {
        code,
        channel: dto.channel,
        status: 'DRAFT',
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
          create: { toStatus: 'DRAFT', byUserId: userId, reason: 'Pedido creado manualmente' },
        },
      },
      include: this.fullInclude(),
    });
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
      return updated;
    });
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
    const count = await this.prisma.order.count();
    return `LHDV-${String(count + 1).padStart(4, '0')}`;
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
