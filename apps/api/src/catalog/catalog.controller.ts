import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { Roles } from '../auth/roles.decorator';
import {
  CreateAdditionDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateAdditionDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/product.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  products(@Query('all') all?: string) {
    return this.catalog.products(all === 'true');
  }

  @Get('additions')
  additions(@Query('all') all?: string) {
    return this.catalog.additions(all === 'true');
  }

  @Roles(UserRole.OWNER)
  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Roles(UserRole.OWNER)
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Post('products/:id/variants')
  addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.catalog.addVariant(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Patch('variants/:id')
  updateVariant(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return this.catalog.updateVariant(id, dto);
  }

  @Roles(UserRole.OWNER)
  @Post('additions')
  createAddition(@Body() dto: CreateAdditionDto) {
    return this.catalog.createAddition(dto);
  }

  @Roles(UserRole.OWNER)
  @Patch('additions/:id')
  updateAddition(@Param('id') id: string, @Body() dto: UpdateAdditionDto) {
    return this.catalog.updateAddition(id, dto);
  }
}
