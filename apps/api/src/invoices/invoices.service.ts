import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInvoiceSettingsDto } from './dto/invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fila única de configuración (la crea con los valores por defecto si no existe). */
  private ensureSettings(client: Prisma.TransactionClient = this.prisma) {
    return client.invoiceSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } });
  }

  getSettings() {
    return this.ensureSettings();
  }

  updateSettings(dto: UpdateInvoiceSettingsDto) {
    return this.prisma.invoiceSettings.upsert({
      where: { id: 'default' },
      update: dto,
      create: { id: 'default', ...dto },
    });
  }

  list() {
    return this.prisma.invoice.findMany({ orderBy: { number: 'desc' }, take: 200 });
  }

  async get(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Cuenta de cobro no encontrada');
    const settings = await this.ensureSettings();
    return { ...invoice, settings };
  }

  /**
   * Genera (o devuelve) la cuenta de cobro de un pedido. Guarda snapshots del cliente y
   * los renglones, y toma el consecutivo de la configuración (que arranca donde se fije).
   */
  async createFromOrder(orderId: string, userId: string) {
    const existing = await this.prisma.invoice.findFirst({ where: { orderId } });
    if (existing) return existing;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: { include: { variant: { include: { product: true } } } } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (!order.customer.name) {
      throw new BadRequestException('El cliente necesita un nombre para la cuenta de cobro');
    }
    if (!order.customer.taxId) {
      throw new BadRequestException('El cliente necesita CC o NIT para la cuenta de cobro');
    }

    const items = order.items.map((it) => ({
      quantity: it.quantity,
      name: `${it.variant.product.name} ${it.variant.name}`,
      unitPriceCop: it.unitPriceCop,
      totalCop: it.unitPriceCop * it.quantity,
    }));

    return this.prisma.$transaction(async (tx) => {
      const settings = await this.ensureSettings(tx);
      const number = settings.nextNumber;
      await tx.invoiceSettings.update({ where: { id: 'default' }, data: { nextNumber: number + 1 } });
      return tx.invoice.create({
        data: {
          number,
          orderId,
          customerName: order.customer.name!,
          customerTaxId: order.customer.taxId,
          customerAddress: order.deliveryAddress ?? null,
          customerPhone: order.customer.whatsappPhone,
          items,
          subtotalCop: order.subtotalCop,
          deliveryCop: order.deliveryCostCop,
          totalCop: order.totalCop,
          createdById: userId,
        },
      });
    });
  }
}
