import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';

@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.deliveryZone.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { deliveryCostCop: 'asc' },
    });
  }

  create(dto: CreateZoneDto) {
    return this.prisma.deliveryZone.create({
      data: { name: dto.name, deliveryCostCop: dto.deliveryCostCop, aliases: dto.aliases ?? [] },
    });
  }

  update(id: string, dto: UpdateZoneDto) {
    return this.prisma.deliveryZone.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true };
  }
}
