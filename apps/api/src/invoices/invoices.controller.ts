import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { UpdateInvoiceSettingsDto } from './dto/invoice.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Roles(UserRole.OWNER, UserRole.SALES)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list() {
    return this.invoices.list();
  }

  @Get('settings')
  getSettings() {
    return this.invoices.getSettings();
  }

  @Roles(UserRole.OWNER)
  @Patch('settings')
  updateSettings(@Body() dto: UpdateInvoiceSettingsDto) {
    return this.invoices.updateSettings(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post('from-order/:orderId')
  createFromOrder(@Param('orderId') orderId: string, @CurrentUser() user: JwtPayload) {
    return this.invoices.createFromOrder(orderId, user.sub);
  }
}
