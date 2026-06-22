import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService, GeoResult } from '../geocoding/geocoding.service';
import { OrdersService } from '../orders/orders.service';
import { createStockBatch } from '../finished-stock/batch.helper';
import { CreateRouteDto } from './dto/route.dto';

/** Estados de pedido que pueden entrar a una ruta de domicilio. */
const ROUTABLE: OrderStatus[] = ['READY', 'OUT_FOR_DELIVERY'];

const routeInclude = {
  courier: { select: { id: true, name: true } },
  orders: {
    orderBy: { routeSeq: 'asc' as const },
    include: {
      customer: { select: { id: true, name: true, whatsappPhone: true } },
      customerAddress: true,
      items: { include: { variant: { include: { product: true } } } },
    },
  },
};

function haversineKm(a: GeoResult, b: GeoResult): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly geocoding: GeocodingService,
    private readonly orders: OrdersService,
  ) {}

  private origin(): GeoResult {
    // Planta La Hora del Venado (Cra. 25 #12 Sur 59, Los Balsos, Medellín). Punto de
    // partida de las rutas; se puede sobreescribir con BAKERY_LAT/BAKERY_LNG del entorno.
    return {
      lat: Number(this.config.get<string>('BAKERY_LAT') ?? 6.1862251),
      lng: Number(this.config.get<string>('BAKERY_LNG') ?? -75.5622073),
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ordena las paradas de la más cercana a la más lejana a la planta. Usa el tiempo REAL
   * de manejo de Google Directions; si Google no responde (o no hay key) cae a la distancia
   * en línea recta. Para repostería (productos delicados): lo más cerca de la planta sale
   * primero. Las paradas sin coordenadas van al final (no se pueden medir).
   */
  private orderStops(
    origin: GeoResult,
    stops: { orderId: string; coords: GeoResult | null }[],
  ): string[] {
    const withCoords = stops.filter(
      (s): s is { orderId: string; coords: GeoResult } => s.coords != null,
    );
    const withoutCoords = stops.filter((s) => s.coords == null);

    // Cerca-primero por distancia en línea recta desde la planta: predecible y robusto.
    // (El tiempo de manejo de Google resultó poco fiable para esto: a veces dejaba un
    // punto MUY cercano de último por cómo calcula la ruta de carro. La distancia geográfica
    // siempre respeta "lo más cerca de la planta primero", que es lo que se busca.)
    const ordered = [...withCoords].sort(
      (a, b) => haversineKm(origin, a.coords) - haversineKm(origin, b.coords),
    );

    return [...ordered.map((s) => s.orderId), ...withoutCoords.map((s) => s.orderId)];
  }

  // ─── Lectura ────────────────────────────────────────────────

  /** Pedidos listos para domicilio que aún no están en una ruta. */
  /**
   * Filtro por fecha para enrutar: por defecto solo pedidos de HOY o atrasados (así no se
   * manda hoy algo que era para mañana). Con `includeUpcoming` trae también los próximos
   * días, para adelantar un pedido a propósito.
   */
  private dueDateFilter(includeUpcoming: boolean) {
    if (includeUpcoming) return {};
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return { OR: [{ deliveryDate: null }, { deliveryDate: { lt: tomorrow } }] };
  }

  availableOrders(includeUpcoming = false) {
    return this.prisma.order.findMany({
      where: {
        routeId: null,
        deliveryType: { not: 'PICKUP' },
        status: { in: ROUTABLE },
        isStockProduction: false,
        ...this.dueDateFilter(includeUpcoming),
      },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        customer: { select: { id: true, name: true, whatsappPhone: true } },
        customerAddress: true,
      },
    });
  }

  list() {
    return this.prisma.deliveryRoute.findMany({
      orderBy: { createdAt: 'desc' },
      include: { courier: { select: { id: true, name: true } }, _count: { select: { orders: true } } },
    });
  }

  /**
   * Rutas EN CURSO con sus paradas (estado + coordenadas) y la última ubicación del
   * domiciliario. Alimenta el tablero de seguimiento en vivo (OWNER y comercial/SALES).
   */
  liveRoutes() {
    return this.prisma.deliveryRoute.findMany({
      where: { status: 'IN_PROGRESS' },
      orderBy: { date: 'asc' },
      include: routeInclude,
    });
  }

  /** Agrega la foto de entrega a un pedido YA entregado, sin cambiar su estado. */
  async addDeliveryPhoto(orderId: string, photoPath?: string) {
    if (!photoPath) throw new BadRequestException('No se recibió la foto');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!order) throw new BadRequestException('Pedido no encontrado');
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException('Solo se puede agregar la foto a un pedido ya entregado');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { deliveryPhotoPath: photoPath },
    });
  }

  /**
   * Junta dos rutas del MISMO domiciliario en una sola (ambas en DRAFT, sin salir aún).
   * Mueve los pedidos de `sourceId` a `targetId`, borra la ruta vacía y recalcula el orden
   * por cercanía de la ruta combinada (desde la planta).
   */
  async mergeRoutes(targetId: string, sourceId: string) {
    if (targetId === sourceId) throw new BadRequestException('Son la misma ruta');
    const [target, source] = await Promise.all([
      this.prisma.deliveryRoute.findUnique({ where: { id: targetId } }),
      this.prisma.deliveryRoute.findUnique({ where: { id: sourceId } }),
    ]);
    if (!target || !source) throw new BadRequestException('Una de las rutas no existe');
    if (target.status !== 'DRAFT' || source.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden juntar rutas que todavía no salieron de la planta');
    }
    if (target.courierId !== source.courierId) {
      throw new BadRequestException('Las rutas son de domiciliarios distintos');
    }
    await this.prisma.order.updateMany({ where: { routeId: sourceId }, data: { routeId: targetId } });
    await this.prisma.deliveryRoute.delete({ where: { id: sourceId } });
    return this.reorder(targetId);
  }

  /**
   * Sugiere a qué domiciliario asignar cada pedido por enrutar: por la zona del
   * pedido (la cubre quien tiene tarifa en ella) y respetando su capacidad. Solo
   * lectura — devuelve una propuesta agrupada que el operador edita y confirma.
   */
  async suggestAssignments(includeUpcoming = false) {
    const orders = await this.prisma.order.findMany({
      where: {
        routeId: null,
        deliveryType: { not: 'PICKUP' },
        status: { in: ROUTABLE },
        isStockProduction: false,
        ...this.dueDateFilter(includeUpcoming),
      },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        customer: { select: { id: true, name: true, whatsappPhone: true } },
        customerAddress: true,
        items: { select: { quantity: true, variant: { select: { capacityLoad: true } } } },
      },
    });

    const couriers = await this.prisma.user.findMany({
      where: { role: 'DELIVERY', active: true },
      select: {
        id: true,
        name: true,
        capacityLimit: true,
        zoneRates: { select: { payCop: true, zone: { select: { name: true, aliases: true } } } },
      },
    });

    // Índice: nombre/alias de zona (minúsculas) -> domiciliarios que la cubren.
    type Cand = { id: string; name: string; capacityLimit: number | null; payCop: number };
    const byZone = new Map<string, Cand[]>();
    for (const c of couriers) {
      for (const zr of c.zoneRates) {
        for (const k of [zr.zone.name, ...zr.zone.aliases].map((x) => x.toLowerCase())) {
          const arr = byZone.get(k) ?? [];
          arr.push({ id: c.id, name: c.name, capacityLimit: c.capacityLimit, payCop: zr.payCop });
          byZone.set(k, arr);
        }
      }
    }

    const assigned = new Map<string, number>(); // courierId -> carga acumulada
    const groups = new Map<
      string,
      { courier: Omit<Cand, 'payCop'>; orders: unknown[]; totalLoad: number }
    >();
    const unassigned: { order: unknown; load: number; reason: string }[] = [];

    for (const o of orders) {
      const load = o.items.reduce((s, it) => s + it.quantity * (it.variant.capacityLoad ?? 1), 0);
      const candidates = byZone.get((o.deliveryZone ?? '').toLowerCase()) ?? [];
      const fit = candidates.filter(
        (c) => c.capacityLimit == null || (assigned.get(c.id) ?? 0) + load <= c.capacityLimit,
      );
      if (fit.length === 0) {
        unassigned.push({
          order: o,
          load,
          reason: candidates.length ? 'sin_capacidad' : 'zona_sin_domiciliario',
        });
        continue;
      }
      // Desempate: reparte parejo (menor carga ya asignada primero).
      fit.sort((a, b) => (assigned.get(a.id) ?? 0) - (assigned.get(b.id) ?? 0));
      const chosen = fit[0];
      assigned.set(chosen.id, (assigned.get(chosen.id) ?? 0) + load);
      const g = groups.get(chosen.id) ?? {
        courier: { id: chosen.id, name: chosen.name, capacityLimit: chosen.capacityLimit },
        orders: [],
        totalLoad: 0,
      };
      g.orders.push({ ...o, suggestedLoad: load, suggestedPayCop: chosen.payCop });
      g.totalLoad += load;
      groups.set(chosen.id, g);
    }

    return { groups: Array.from(groups.values()), unassigned };
  }

  async get(id: string) {
    const route = await this.prisma.deliveryRoute.findUnique({ where: { id }, include: routeInclude });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    return route;
  }

  /** Todas las rutas sin terminar del domiciliario, para que elija cuál hacer. */
  myRoutes(userId: string) {
    return this.prisma.deliveryRoute.findMany({
      where: { courierId: userId, status: { in: ['DRAFT', 'IN_PROGRESS'] } },
      orderBy: { date: 'asc' },
      include: routeInclude,
    });
  }

  // ─── Operaciones ────────────────────────────────────────────

  async create(dto: CreateRouteDto) {
    const orders = await this.prisma.order.findMany({
      where: { id: { in: dto.orderIds } },
      include: { customerAddress: true },
    });

    const stops: { orderId: string; coords: GeoResult | null }[] = [];
    let networkCalls = 0;
    for (const o of orders) {
      if (o.customerAddress?.lat != null && o.customerAddress?.lng != null) {
        stops.push({ orderId: o.id, coords: { lat: o.customerAddress.lat, lng: o.customerAddress.lng } });
        continue;
      }
      if (networkCalls > 0) await this.sleep(1100); // rate limit de Nominatim
      networkCalls += 1;
      let coords: GeoResult | null = null;
      if (o.customerAddressId) coords = await this.geocoding.geocodeAddress(o.customerAddressId);
      else if (o.deliveryAddress)
        coords = await this.geocoding.geocode(`${o.deliveryAddress}, Medellín, Colombia`);
      stops.push({ orderId: o.id, coords });
    }

    const orderedIds = this.orderStops(this.origin(), stops);
    const route = await this.prisma.deliveryRoute.create({
      data: { date: new Date(dto.date), courierId: dto.courierId ?? null },
    });
    let seq = 1;
    for (const orderId of orderedIds) {
      await this.prisma.order.update({ where: { id: orderId }, data: { routeId: route.id, routeSeq: seq++ } });
    }
    return this.get(route.id);
  }

  /** Reordena una ruta existente (por si se agregaron/quitaron paradas). */
  async reorder(id: string) {
    const route = await this.get(id);
    const stops = route.orders.map((o) => ({
      orderId: o.id,
      coords:
        o.customerAddress?.lat != null && o.customerAddress?.lng != null
          ? { lat: o.customerAddress.lat, lng: o.customerAddress.lng }
          : null,
    }));
    const orderedIds = this.orderStops(this.origin(), stops);
    let seq = 1;
    for (const orderId of orderedIds) {
      await this.prisma.order.update({ where: { id: orderId }, data: { routeSeq: seq++ } });
    }
    return this.get(id);
  }

  async start(id: string, userId: string, role: UserRole) {
    const route = await this.get(id);
    if (route.orders.length === 0) {
      throw new BadRequestException('No se puede iniciar una ruta sin pedidos');
    }
    // Una ruta en curso a la vez: si el domiciliario ya tiene otra IN_PROGRESS, debe terminarla primero.
    if (route.courierId) {
      const otra = await this.prisma.deliveryRoute.findFirst({
        where: { courierId: route.courierId, status: 'IN_PROGRESS', id: { not: id } },
        select: { id: true },
      });
      if (otra) throw new BadRequestException('Ya tenés una ruta en curso. Terminala antes de empezar otra.');
    }
    await this.prisma.deliveryRoute.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    for (const o of route.orders) {
      if (o.status === 'READY') {
        await this.orders.applyTransition(o.id, 'OUT_FOR_DELIVERY', {
          byUserId: userId,
          actingRole: role,
          reason: 'Despacho de ruta',
        });
      }
    }
    return this.get(id);
  }

  async markDelivered(
    orderId: string,
    opts: { userId: string; role: UserRole; photoPath?: string; notes?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { route: { select: { courierId: true } } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    await this.orders.applyTransition(orderId, 'DELIVERED', {
      byUserId: opts.userId,
      actingRole: opts.role,
      reason: opts.notes ?? 'Entregado',
    });

    // Snapshot del pago al domiciliario: quién entregó + tarifa de su zona.
    // Si no hay courier en la ruta o no hay tarifa configurada, queda null (no
    // bloquea la entrega; la liquidación lo marca como tarifa sin definir).
    const courierId = order.route?.courierId ?? null;
    let courierPayCop: number | null = null;
    if (courierId && order.deliveryZone) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: {
          OR: [{ name: order.deliveryZone }, { aliases: { has: order.deliveryZone.toLowerCase() } }],
        },
        select: { id: true },
      });
      if (zone) {
        const rate = await this.prisma.courierZoneRate.findUnique({
          where: { courierId_zoneId: { courierId, zoneId: zone.id } },
          select: { payCop: true },
        });
        courierPayCop = rate?.payCop ?? null;
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveredAt: new Date(),
        deliveryPhotoPath: opts.photoPath ?? undefined,
        deliveredByCourierId: courierId ?? undefined,
        courierPayCop: courierPayCop ?? undefined,
      },
    });

    if (order.routeId) await this.closeRouteIfDone(order.routeId);
    return updated;
  }

  updateLocation(id: string, lat: number, lng: number) {
    return this.prisma.deliveryRoute.update({
      where: { id },
      data: { courierLat: lat, courierLng: lng, courierAt: new Date() },
    });
  }

  // ─── Edición de ruta (solo antes de salir) ──────────────────

  private async assertEditable(routeId: string) {
    const route = await this.prisma.deliveryRoute.findUnique({
      where: { id: routeId },
      select: { status: true },
    });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    if (route.status !== 'DRAFT') {
      throw new BadRequestException('Solo se puede editar una ruta que todavía no salió de la planta');
    }
  }

  /** Saca un pedido de una ruta que aún no salió: vuelve a "disponibles" y se reordena. */
  async removeFromRoute(routeId: string, orderId: string) {
    await this.assertEditable(routeId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { routeId: true },
    });
    if (!order || order.routeId !== routeId) {
      throw new BadRequestException('El pedido no está en esta ruta');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { routeId: null, routeSeq: null },
    });
    return this.reorder(routeId);
  }

  /** Añade pedidos disponibles a una ruta que aún no salió y la reordena. */
  async addToRoute(routeId: string, orderIds: string[]) {
    await this.assertEditable(routeId);
    const orders = await this.prisma.order.findMany({
      where: {
        id: { in: orderIds },
        routeId: null,
        deliveryType: { not: 'PICKUP' },
        status: { in: ROUTABLE },
      },
      include: { customerAddress: true },
    });
    if (orders.length === 0) {
      throw new BadRequestException('Ninguno de los pedidos está disponible para añadir');
    }
    let networkCalls = 0;
    for (const o of orders) {
      // Geocodifica si la dirección no tiene coordenadas (para ubicarla en el orden).
      if (o.customerAddressId && (o.customerAddress?.lat == null || o.customerAddress?.lng == null)) {
        if (networkCalls > 0) await this.sleep(1100);
        networkCalls += 1;
        await this.geocoding.geocodeAddress(o.customerAddressId);
      }
      await this.prisma.order.update({ where: { id: o.id }, data: { routeId } });
    }
    return this.reorder(routeId);
  }

  /**
   * "No entregado": el domiciliario devuelve el pedido a la planta.
   *  - mode 'stock': se cierra (CANCELLED) y sus productos entran al stock terminado
   *    (los renglones que habían salido de stock se reponen al cancelar; los producidos
   *    se suman como productos físicos que volvieron).
   *  - mode 'reschedule': vuelve a "listo" para re-enrutarlo (mismo cliente, otro día).
   */
  async returnOrder(
    orderId: string,
    mode: 'stock' | 'reschedule',
    opts: { userId: string; role: UserRole; notes?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { quantity: true, productVariantId: true, fromStockQty: true } } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    const routeId = order.routeId;

    if (mode === 'stock') {
      await this.orders.applyTransition(orderId, 'CANCELLED', {
        byUserId: opts.userId,
        actingRole: opts.role,
        reason: opts.notes ?? 'No entregado — devuelto al stock',
      });
      for (const it of order.items) {
        const producedQty = it.quantity - it.fromStockQty; // lo producido (no salió de stock)
        if (producedQty <= 0) continue;
        await this.prisma.productVariant.update({
          where: { id: it.productVariantId },
          data: { readyStock: { increment: producedQty } },
        });
        await createStockBatch(this.prisma, it.productVariantId, producedQty, opts.userId);
        await this.prisma.finishedStockMovement.create({
          data: {
            productVariantId: it.productVariantId,
            type: 'RETURN',
            quantity: producedQty,
            orderId,
            reason: 'Devuelto de domicilio (no entregado)',
          },
        });
      }
    } else {
      await this.orders.applyTransition(orderId, 'READY', {
        byUserId: opts.userId,
        actingRole: opts.role,
        reason: opts.notes ?? 'No entregado — reprogramado',
      });
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { routeId: null, routeSeq: null },
    });
    if (routeId) await this.closeRouteIfDone(routeId);
    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

  /** Si en la ruta ya no quedan pedidos pendientes (entregados o devueltos), la cierra. */
  private async closeRouteIfDone(routeId: string) {
    // Cierra la ruta cuando no le quedan pedidos pendientes (entregados o devueltos),
    // aunque haya quedado vacía — así no se queda "en curso" atascada y bloqueando.
    const pending = await this.prisma.order.count({
      where: { routeId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
    });
    if (pending === 0) {
      await this.prisma.deliveryRoute.update({ where: { id: routeId }, data: { status: 'DONE' } });
    }
  }

  /** Termina una ruta a la fuerza: los pedidos pendientes vuelven a "disponibles" (READY). */
  async finishRoute(id: string) {
    const route = await this.prisma.deliveryRoute.findUnique({ where: { id }, select: { id: true } });
    if (!route) throw new NotFoundException('Ruta no encontrada');
    await this.prisma.order.updateMany({
      where: { routeId: id, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      data: { routeId: null, routeSeq: null, status: 'READY' },
    });
    return this.prisma.deliveryRoute.update({ where: { id }, data: { status: 'DONE' } });
  }
}
