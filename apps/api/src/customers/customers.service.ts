import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string) {
    const where: Prisma.CustomerWhereInput | undefined = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { whatsappPhone: { contains: search } },
          ],
        }
      : undefined;

    return this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    });
  }

  /** Busca un cliente por su teléfono (su identificador natural) con su agenda de direcciones. */
  lookup(phone: string) {
    return this.prisma.customer.findUnique({
      where: { whatsappPhone: phone },
      include: { addresses: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: { createdAt: 'asc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            code: true,
            status: true,
            totalCop: true,
            deliveryDate: true,
            createdAt: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const exists = await this.prisma.customer.findUnique({
      where: { whatsappPhone: dto.whatsappPhone },
    });
    if (exists) throw new ConflictException('Ya existe un cliente con ese WhatsApp');
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.get(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  // ─── Agenda de direcciones ──────────────────────────────────

  async addAddress(customerId: string, dto: CreateAddressDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.customerAddress.create({ data: { ...dto, customerId } });
  }

  async removeAddress(addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address) throw new NotFoundException('Dirección no encontrada');
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { deleted: true };
  }
}
