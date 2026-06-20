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
    return {
      lat: Number(this.config.get<string>('BAKERY_LAT') ?? 6.2442),
      lng: Number(this.config.get<string>('BAKERY_LNG') ?? -75.5812),
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Ordena las paradas por vecino-más-cercano desde el origen; las sin coordenadas van al final. */
  private orderByNearest(origin: GeoResult, stops: { orderId: string; coords: GeoResult | null }[]) {
    const withCoords = stops.filter(
      (s): s is { orderId: string; coords: GeoResult } => s.coords != null,
    );
    const withoutCoords = stops.filter((s) => s.coords == null);

    const ordered: string[] = [];
    let current = origin;
    const remaining = [...withCoords];
    while (remaining.length) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(current, remaining[i].coords);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next.orderId);
      current = next.coords;
    }
    return [...ordered, ...withoutCoords.map((s) => s.orderId)];
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

    const orderedIds = this.orderByNearest(this.origin(), stops);
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
    const orderedIds = this.orderByNearest(this.origin(), stops);
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
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    await this.orders.applyTransition(orderId, 'DELIVERED', {
      byUserId: opts.userId,
      actingRole: opts.role,
      reason: opts.notes ?? 'Entregado',
    });
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { deliveredAt: new Date(), deliveryPhotoPath: opts.photoPath ?? undefined },
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
