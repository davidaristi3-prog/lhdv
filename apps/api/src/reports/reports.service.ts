import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IngredientsService } from '../ingredients/ingredients.service';
import { dateRange } from '../common/date-range';

/** Estados que cuentan como venta real (ya pasaron el pago). */
const SALE_STATUSES: OrderStatus[] = [
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingredients: IngredientsService,
  ) {}

  private saleWhere(from?: string, to?: string) {
    return { status: { in: SALE_STATUSES }, createdAt: dateRange(from, to) };
  }

  /** Resumen de rentabilidad del período (base: fecha de creación del pedido). */
  async summary(from?: string, to?: string) {
    const [orders, costByVariant, expenses] = await Promise.all([
      this.prisma.order.findMany({
        where: this.saleWhere(from, to),
        select: { totalCop: true, items: { select: { productVariantId: true, quantity: true } } },
      }),
      this.ingredients.costByVariant(),
      this.prisma.expense.aggregate({ _sum: { amountCop: true }, where: { date: dateRange(from, to) } }),
    ]);

    const ingresosCop = orders.reduce((s, o) => s + o.totalCop, 0);
    const ventas = orders.length;

    let cogs = 0;
    for (const o of orders) {
      for (const it of o.items) {
        cogs += (costByVariant.get(it.productVariantId) ?? 0) * it.quantity;
      }
    }
    const cogsCop = Math.round(cogs);
    const gastosCop = expenses._sum.amountCop ?? 0;
    const utilidadBrutaCop = ingresosCop - cogsCop;
    const utilidadNetaCop = utilidadBrutaCop - gastosCop;

    return {
      ventas,
      ingresosCop,
      ticketPromedioCop: ventas ? Math.round(ingresosCop / ventas) : 0,
      cogsCop,
      gastosCop,
      utilidadBrutaCop,
      utilidadNetaCop,
      margenBrutoPct: ingresosCop ? Math.round((utilidadBrutaCop / ingresosCop) * 100) : 0,
      margenNetoPct: ingresosCop ? Math.round((utilidadNetaCop / ingresosCop) * 100) : 0,
    };
  }

  async topProducts(from?: string, to?: string, limit = 10) {
    const orders = await this.prisma.order.findMany({
      where: this.saleWhere(from, to),
      select: {
        items: {
          select: {
            quantity: true,
            unitPriceCop: true,
            variant: { select: { product: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const map = new Map<string, { name: string; cantidad: number; ingresosCop: number }>();
    for (const o of orders) {
      for (const it of o.items) {
        const p = it.variant.product;
        const cur = map.get(p.id) ?? { name: p.name, cantidad: 0, ingresosCop: 0 };
        cur.cantidad += it.quantity;
        cur.ingresosCop += it.unitPriceCop * it.quantity;
        map.set(p.id, cur);
      }
    }
    return [...map.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.ingresosCop - a.ingresosCop)
      .slice(0, limit);
  }

  async topCustomers(from?: string, to?: string, limit = 10) {
    const orders = await this.prisma.order.findMany({
      where: this.saleWhere(from, to),
      select: {
        totalCop: true,
        customer: { select: { id: true, name: true, whatsappPhone: true } },
      },
    });

    const map = new Map<string, { name: string | null; phone: string; pedidos: number; totalCop: number }>();
    for (const o of orders) {
      const c = o.customer;
      const cur = map.get(c.id) ?? { name: c.name, phone: c.whatsappPhone, pedidos: 0, totalCop: 0 };
      cur.pedidos += 1;
      cur.totalCop += o.totalCop;
      map.set(c.id, cur);
    }
    return [...map.entries()]
      .map(([customerId, v]) => ({ customerId, ...v }))
      .sort((a, b) => b.totalCop - a.totalCop)
      .slice(0, limit);
  }

  /** Ingresos y ventas por mes del año (estacionalidad). */
  async salesByMonth(year: number) {
    const start = new Date(`${year}-01-01T00:00:00`);
    const end = new Date(`${year + 1}-01-01T00:00:00`);
    const orders = await this.prisma.order.findMany({
      where: { status: { in: SALE_STATUSES }, createdAt: { gte: start, lt: end } },
      select: { totalCop: true, createdAt: true },
    });

    const months = Array.from({ length: 12 }, (_, m) => ({ mes: m + 1, ingresosCop: 0, ventas: 0 }));
    for (const o of orders) {
      const m = o.createdAt.getMonth();
      months[m].ingresosCop += o.totalCop;
      months[m].ventas += 1;
    }
    return months;
  }

  async expensesByCategory(from?: string, to?: string) {
    const grouped = await this.prisma.expense.groupBy({
      by: ['category'],
      _sum: { amountCop: true },
      where: { date: dateRange(from, to) },
    });
    return grouped
      .map((g) => ({ category: g.category, totalCop: g._sum.amountCop ?? 0 }))
      .sort((a, b) => b.totalCop - a.totalCop);
  }
}
