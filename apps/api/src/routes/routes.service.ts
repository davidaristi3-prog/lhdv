import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService, GeoResult } from '../geocoding/geocoding.service';
import { OrdersService } from '../orders/orders.service';
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
   * Ordena las paradas por distancia a la planta, de la más cercana a la más lejana.
   * Para repostería (productos delicados): se sale entregando primero lo más cerca de
   * la planta y se deja lo más lejano para el final. Las paradas sin coordenadas van al
   * final (no se pueden medir).
   */
  private orderByDistanceToPlant(
    origin: GeoResult,
    stops: { orderId: string; coords: GeoResult | null }[],
  ) {
    const withCoords = stops.filter(
      (s): s is { orderId: string; coords: GeoResult } => s.coords != null,
    );
    const withoutCoords = stops.filter((s) => s.coords == null);

    withCoords.sort((a, b) => haversineKm(origin, a.coords) - haversineKm(origin, b.coords));

    return [...withCoords.map((s) => s.orderId), ...withoutCoords.map((s) => s.orderId)];
  }

  // ─── Lectura ────────────────────────────────────────────────

  /** Pedidos listos para domicilio que aún no están en una ruta. */
  availableOrders() {
    return this.prisma.order.findMany({
      where: { routeId: null, deliveryType: { not: 'PICKUP' }, status: { in: ROUTABLE } },
      orderBy: { createdAt: 'asc' },
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
   * Sugiere a qué domiciliario asignar cada pedido por enrutar: por la zona del
   * pedido (la cubre quien tiene tarifa en ella) y respetando su capacidad. Solo
   * lectura — devuelve una propuesta agrupada que el operador edita y confirma.
   */
  async suggestAssignments() {
    const orders = await this.prisma.order.findMany({
      where: { routeId: null, deliveryType: { not: 'PICKUP' }, status: { in: ROUTABLE } },
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

  myActiveRoute(userId: string) {
    return this.prisma.deliveryRoute.findFirst({
      where: { courierId: userId, status: { in: ['DRAFT', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
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

    const orderedIds = this.orderByDistanceToPlant(this.origin(), stops);
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
    const orderedIds = this.orderByDistanceToPlant(this.origin(), stops);
    let seq = 1;
    for (const orderId of orderedIds) {
      await this.prisma.order.update({ where: { id: orderId }, data: { routeSeq: seq++ } });
    }
    return this.get(id);
  }

  async start(id: string, userId: string, role: UserRole) {
    const route = await this.get(id);
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

    if (order.routeId) {
      const pending = await this.prisma.order.count({
        where: { routeId: order.routeId, status: { not: 'DELIVERED' } },
      });
      if (pending === 0) {
        await this.prisma.deliveryRoute.update({ where: { id: order.routeId }, data: { status: 'DONE' } });
      }
    }
    return updated;
  }

  updateLocation(id: string, lat: number, lng: number) {
    return this.prisma.deliveryRoute.update({
      where: { id },
      data: { courierLat: lat, courierLng: lng, courierAt: new Date() },
    });
  }
}
