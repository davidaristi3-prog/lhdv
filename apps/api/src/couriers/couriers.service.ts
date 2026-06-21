import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetZoneRatesDto, UpdateCourierProfileDto } from './dto/courier.dto';

/** Campos públicos del domiciliario, incluidos los nuevos (vehículo, capacidad, zonas-tarifa). */
const COURIER_FIELDS = {
  id: true,
  name: true,
  email: true,
  active: true,
  vehicle: true,
  capacityLimit: true,
  zoneRates: {
    select: { id: true, zoneId: true, payCop: true, zone: { select: { id: true, name: true } } },
    orderBy: { zone: { name: 'asc' as const } },
  },
} as const;

@Injectable()
export class CouriersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: { role: 'DELIVERY' },
      select: COURIER_FIELDS,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const courier = await this.prisma.user.findFirst({
      where: { id, role: 'DELIVERY' },
      select: COURIER_FIELDS,
    });
    if (!courier) throw new NotFoundException('Domiciliario no encontrado');
    return courier;
  }

  async updateProfile(id: string, dto: UpdateCourierProfileDto) {
    await this.get(id); // valida que exista y sea DELIVERY
    await this.prisma.user.update({
      where: { id },
      data: {
        vehicle: dto.vehicle,
        // undefined = no tocar; null = limpiar el tope; number = setear.
        capacityLimit: dto.capacityLimit,
      },
    });
    return this.get(id);
  }

  /** Reemplaza el conjunto completo de zonas-tarifa del domiciliario. */
  async setZoneRates(id: string, dto: SetZoneRatesDto) {
    await this.get(id);
    const zoneIds = dto.rates.map((r) => r.zoneId);
    if (zoneIds.length) {
      const found = await this.prisma.deliveryZone.count({ where: { id: { in: zoneIds } } });
      if (found !== new Set(zoneIds).size) {
        throw new BadRequestException('Alguna zona indicada no existe');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      if (zoneIds.length === 0) {
        await tx.courierZoneRate.deleteMany({ where: { courierId: id } });
        return;
      }
      await tx.courierZoneRate.deleteMany({
        where: { courierId: id, zoneId: { notIn: zoneIds } },
      });
      for (const r of dto.rates) {
        await tx.courierZoneRate.upsert({
          where: { courierId_zoneId: { courierId: id, zoneId: r.zoneId } },
          create: { courierId: id, zoneId: r.zoneId, payCop: r.payCop },
          update: { payCop: r.payCop },
        });
      }
    });
    return this.get(id);
  }

  /**
   * Estado de cuenta del domiciliario (para su propia sesión): lo ganado esta
   * semana y este mes, lo pendiente de liquidar y el historial de liquidaciones.
   * `courierId` es el id de usuario del domiciliario.
   */
  async myAccount(courierId: string) {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 0 = lunes
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const payOf = (orders: { courierPayCop: number | null }[]) => ({
      count: orders.length,
      totalCop: orders.reduce((s, o) => s + (o.courierPayCop ?? 0), 0),
    });

    const [week, month, pending, settlements] = await Promise.all([
      this.prisma.order.findMany({
        where: { deliveredByCourierId: courierId, deliveredAt: { gte: startOfWeek } },
        select: { courierPayCop: true },
      }),
      this.prisma.order.findMany({
        where: { deliveredByCourierId: courierId, deliveredAt: { gte: startOfMonth } },
        select: { courierPayCop: true },
      }),
      this.prisma.order.findMany({
        where: { deliveredByCourierId: courierId, settlementId: null },
        select: { courierPayCop: true },
      }),
      this.prisma.courierSettlement.findMany({
        where: { courierId },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);

    return {
      week: payOf(week),
      month: payOf(month),
      pending: payOf(pending),
      settlements,
    };
  }
}
