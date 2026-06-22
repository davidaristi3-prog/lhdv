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
import { createStockBatch, consumeFromBatches, expiredStockQty } from '../finished-stock/batch.helper';
import { CreateOrderDto } from './dto/create-order.dto';

interface TransitionOptions {
  /** Usuario del panel que ejecuta el cambio. `null` = sistema (bot, webhook). */
  byUserId?: string | null;
  reason?: string;
  /** Rol del usuario que ejecuta, para aplicar restricciones (Ventas = solo consulta de cocina). */
  actingRole?: UserRole;
  /** Al volver de producción a confirmado: true = baja (merma, no repone inventario). */
  scrap?: boolean;
  /** Evidencia opcional del evento (p.ej. foto de la baja). */
  photoPath?: string;
}

/** Estados que ve el tablero de cocina: solo producción (la entrega se maneja aparte). */
const BOARD_STATUSES: OrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION', 'READY'];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Lectura ────────────────────────────────────────────────

  list(params: { status?: OrderStatus; date?: string } = {}) {
    return this.prisma.order.findMany({
      where: {
        status: params.status,
        deliveryDate: params.date ? this.dayRange(params.date) : undefined,
        isStockProduction: false, // los pedidos de producción para stock solo se ven en Cocina
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

    // Si viene CC/NIT (para cuenta de cobro), lo guardamos en la ficha del cliente.
    if (dto.taxId) {
      await this.prisma.customer.update({ where: { id: customerId }, data: { taxId: dto.taxId } });
    }

    // Cargar variantes y adiciones para fijar precios (snapshots).
    const { itemsData, subtotal } = await this.buildOrderItems(items);

    const isFree = dto.freeReason != null; // regalo/garantía: mueve inventario, no cobra
    // Descuento del cliente (mayorista): se aplica al subtotal de lista.
    const customerRow = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { discountPercent: true },
    });
    const discount = isFree ? 0 : (customerRow?.discountPercent ?? 0);
    const netSubtotal = Math.round(subtotal * (1 - discount / 100));
    const deliveryCostCop = isFree ? 0 : (dto.deliveryCostCop ?? 0);
    const delivery = await this.resolveAddress(customerId, dto);

    // Siempre se crea como borrador (sin número). Si hay que enviarlo a cocina, se hace
    // a través de confirmManual, que evalúa el stock de producto terminado, decide si
    // pasa por cocina o queda listo, y asigna el consecutivo.
    const created = await this.prisma.order.create({
      data: {
        code: null,
        channel: dto.channel,
        status: 'DRAFT',
        isCustom: dto.isCustom ?? false,
        freeReason: dto.freeReason ?? null,
        deliveryType: dto.deliveryType,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        deliveryAddress: delivery.deliveryAddress,
        deliveryZone: delivery.deliveryZone,
        deliveryCostCop,
        subtotalCop: subtotal,
        totalCop: isFree ? 0 : netSubtotal + deliveryCostCop,
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

    if (dto.confirm) {
      await this.confirmManual(created.id, { byUserId: userId });
      return this.get(created.id);
    }
    return created;
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

      // Al entrar a cocina por primera vez (CONFIRMED) recibe su número consecutivo.
      const code = to === 'CONFIRMED' && order.code == null ? await this.nextOrderCode(tx) : undefined;
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: to, ...(code ? { code } : {}) },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: to,
          byUserId: opts.byUserId ?? null,
          reason: opts.reason ?? null,
          photoPath: opts.photoPath ?? null,
        },
      });

      // Inventario: al iniciar producción se descuentan los insumos según la receta
      // de cada producto del pedido (una sola vez, controlado por inventoryDeductedAt).
      // Se minimizan las queries —una sola lectura de recetas con `in`, un solo
      // createMany de movimientos— para no agotar el tiempo de la transacción
      // interactiva contra Postgres remoto (Neon).
      if (to === 'IN_PRODUCTION' && order.inventoryDeductedAt == null) {
        const orderItems = (
          await tx.orderItem.findMany({
            where: { orderId },
            select: { quantity: true, fromStockQty: true, productVariantId: true },
          })
        )
          // Solo se produce lo que el stock terminado no cubrió.
          .map((it) => ({ productVariantId: it.productVariantId, produceQty: it.quantity - it.fromStockQty }))
          .filter((it) => it.produceQty > 0);
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
            consume.set(r.ingredientId, (consume.get(r.ingredientId) ?? 0) + r.quantity * it.produceQty);
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

      // Cancelar devuelve al stock los productos terminados que el pedido había tomado.
      if (to === 'CANCELLED') {
        const taken = await tx.finishedStockMovement.findMany({
          where: { orderId, type: 'SALE' },
          select: { productVariantId: true, quantity: true },
        });
        for (const m of taken) {
          await tx.productVariant.update({
            where: { id: m.productVariantId },
            data: { readyStock: { increment: m.quantity } },
          });
          // Vuelve a stock CON su lote. Si no se crea el lote, readyStock queda por encima
          // de la suma de lotes y el consumo siguiente toma de menos (lo que salió de stock).
          await createStockBatch(tx, m.productVariantId, m.quantity, opts.byUserId);
          await tx.finishedStockMovement.create({
            data: {
              productVariantId: m.productVariantId,
              type: 'RETURN',
              quantity: m.quantity,
              orderId,
              reason: 'Pedido cancelado',
            },
          });
        }
      }

      // Pedido de producción para stock: al quedar listo, suma sus unidades al stock
      // terminado y se cierra (no va a entrega; ya cumplió su propósito de reponer).
      if (to === 'READY' && order.isStockProduction) {
        const prodItems = await tx.orderItem.findMany({
          where: { orderId },
          select: { quantity: true, productVariantId: true },
        });
        for (const it of prodItems) {
          await tx.productVariant.update({
            where: { id: it.productVariantId },
            data: { readyStock: { increment: it.quantity } },
          });
          await createStockBatch(tx, it.productVariantId, it.quantity, opts.byUserId);
          await tx.finishedStockMovement.create({
            data: {
              productVariantId: it.productVariantId,
              type: 'PRODUCTION',
              quantity: it.quantity,
              orderId,
              reason: 'Producción para stock terminada',
            },
          });
        }
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        await tx.orderStatusEvent.create({
          data: {
            orderId,
            fromStatus: 'READY',
            toStatus: 'DELIVERED',
            byUserId: opts.byUserId ?? null,
            reason: 'Stock repuesto',
          },
        });
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

      // Cubre con stock de producto terminado los renglones que alcance. Si TODO el
      // pedido queda cubierto, no pasa por cocina: va directo a Listo.
      const allFromStock = await this.consumeFinishedStock(tx, orderId);
      const target: OrderStatus = allFromStock ? 'READY' : 'CONFIRMED';

      // Al entrar a cocina (o quedar listo desde stock) recibe su número consecutivo.
      const code = order.code ?? (await this.nextOrderCode(tx));
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: target, code },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: target,
          byUserId: opts.byUserId ?? null,
          reason: allFromStock
            ? 'Cubierto desde stock listo (no pasó por cocina)'
            : (opts.reason ?? 'Enviado a cocina manualmente'),
        },
      });
      return updated;
    });
  }

  /**
   * Al enviar a cocina: cubre con el stock de producto terminado los renglones que
   * alcancen (readyStock >= cantidad del renglón). Los marca `fromStock`, descuenta
   * el stock y registra la venta. No parte renglones: si el stock no cubre toda la
   * cantidad de un renglón, ese renglón se produce normal.
   * Devuelve true si TODOS los renglones quedaron cubiertos desde stock.
   */
  private async consumeFinishedStock(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<boolean> {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { id: true, quantity: true, productVariantId: true },
    });
    if (items.length === 0) return false;

    let allFromStock = true;
    for (const it of items) {
      // Lo disponible para vender = readyStock menos lo vencido (lo vencido no se vende).
      // Se usa readyStock (no solo la suma de lotes) para que también se cubra el stock
      // histórico sin lote; así nunca se toma de menos de lo que figura disponible.
      const variant = await tx.productVariant.findUnique({
        where: { id: it.productVariantId },
        select: { readyStock: true },
      });
      const expired = await expiredStockQty(tx, it.productVariantId);
      const sellable = Math.max(0, (variant?.readyStock ?? 0) - expired);
      const take = Math.min(sellable, it.quantity);
      if (take > 0) {
        // Descuenta de los lotes vigentes FIFO por vencimiento (puede quedar corto si hay
        // stock sin lote); igual se descuenta de readyStock para que cuadren.
        await consumeFromBatches(tx, it.productVariantId, take);
        await tx.productVariant.update({
          where: { id: it.productVariantId },
          data: { readyStock: { decrement: take } },
        });
        await tx.orderItem.update({ where: { id: it.id }, data: { fromStockQty: take } });
        await tx.finishedStockMovement.create({
          data: {
            productVariantId: it.productVariantId,
            type: 'SALE',
            quantity: take,
            orderId,
            reason: 'Cubierto desde stock al enviar a cocina',
          },
        });
      }
      if (take < it.quantity) allFromStock = false;
    }
    return allFromStock;
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

  private async nextOrderCode(client: Prisma.TransactionClient = this.prisma): Promise<string> {
    // El consecutivo cuenta solo pedidos que ya tienen código (los que entraron a
    // cocina). Se basa en el código más alto existente, NO en count(), para no
    // reusar huecos de borradores borrados (chocaría con el unique → P2002).
    const last = await client.order.findFirst({
      where: { code: { not: null } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last?.code ? parseInt(last.code.replace(/\D/g, ''), 10) || 0 : 0;
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
