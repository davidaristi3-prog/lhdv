import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dateRange } from '../common/date-range';
import { GenerateSettlementDto } from './dto/settlement.dto';

const ORDER_SELECT = {
  id: true,
  code: true,
  deliveryZone: true,
  courierPayCop: true,
  deliveredAt: true,
  customer: { select: { name: true, whatsappPhone: true } },
} as const;

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pedidos entregados aún no liquidados del domiciliario en el período (sin generar nada). */
  async preview(courierId: string, from?: string, to?: string) {
    const orders = await this.prisma.order.findMany({
      where: { deliveredByCourierId: courierId, settlementId: null, deliveredAt: dateRange(from, to) },
      orderBy: { deliveredAt: 'asc' },
      select: ORDER_SELECT,
    });
    const totalCop = orders.reduce((s, o) => s + (o.courierPayCop ?? 0), 0);
    const missingRate = orders.filter((o) => o.courierPayCop == null).length;
    return { courierId, from, to, orders, totalCop, orderCount: orders.length, missingRate };
  }

  /** Genera la liquidación (PENDING) y marca esos pedidos (un pedido = una sola liquidación). */
  async generate(courierId: string, dto: GenerateSettlementDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          deliveredByCourierId: courierId,
          settlementId: null,
          deliveredAt: dateRange(dto.from, dto.to),
        },
        select: { id: true, courierPayCop: true },
      });
      if (orders.length === 0) {
        throw new BadRequestException('No hay entregas para liquidar en ese período');
      }
      const totalCop = orders.reduce((s, o) => s + (o.courierPayCop ?? 0), 0);
      const settlement = await tx.courierSettlement.create({
        data: {
          courierId,
          period: dto.period,
          status: 'PENDING',
          periodFrom: new Date(`${dto.from}T00:00:00`),
          periodTo: new Date(`${dto.to}T00:00:00`),
          totalCop,
          orderCount: orders.length,
          notes: dto.notes,
          createdById: userId,
        },
      });
      await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) }, settlementId: null },
        data: { settlementId: settlement.id },
      });
      return settlement;
    });
  }

  list(courierId?: string, status?: string) {
    return this.prisma.courierSettlement.findMany({
      where: {
        courierId: courierId || undefined,
        status: status ? (status as SettlementStatus) : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        courier: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
    });
  }

  async get(id: string) {
    const settlement = await this.prisma.courierSettlement.findUnique({
      where: { id },
      include: {
        courier: { select: { id: true, name: true } },
        orders: { orderBy: { deliveredAt: 'asc' }, select: ORDER_SELECT },
      },
    });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada');
    return settlement;
  }

  async markPaid(id: string) {
    const s = await this.prisma.courierSettlement.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Liquidación no encontrada');
    if (s.status === 'PAID') return s; // idempotente
    return this.prisma.courierSettlement.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }
}
