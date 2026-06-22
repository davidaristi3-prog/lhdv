import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAdditionDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateAdditionDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/product.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  products(includeInactive = false) {
    return this.prisma.product.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
      include: { variants: { orderBy: { priceCop: 'asc' } } },
    });
  }

  additions(includeInactive = false) {
    return this.prisma.addition.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        isSeasonal: dto.isSeasonal ?? false,
        shelfLifeDays: dto.shelfLifeDays ?? null,
        variants: { create: dto.variants },
      },
      include: { variants: true },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureProduct(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async addVariant(productId: string, dto: CreateVariantDto) {
    await this.ensureProduct(productId);
    return this.prisma.productVariant.create({ data: { ...dto, productId } });
  }

  updateVariant(id: string, dto: UpdateVariantDto) {
    return this.prisma.productVariant.update({ where: { id }, data: dto });
  }

  createAddition(dto: CreateAdditionDto) {
    return this.prisma.addition.create({ data: dto });
  }

  updateAddition(id: string, dto: UpdateAdditionDto) {
    return this.prisma.addition.update({ where: { id }, data: dto });
  }

  private async ensureProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
  }
}
