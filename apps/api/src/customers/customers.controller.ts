import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.customers.list(search);
  }

  // Debe ir antes de ':id' para no confundirse con un id.
  @Get('lookup')
  lookup(@Query('phone') phone: string) {
    return this.customers.lookup(phone);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() dto: CreateAddressDto) {
    return this.customers.addAddress(id, dto);
  }

  @Roles(UserRole.OWNER, UserRole.SALES)
  @Delete('addresses/:addressId')
  removeAddress(@Param('addressId') addressId: string) {
    return this.customers.removeAddress(addressId);
  }
}
