import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/roles.decorator';

@Roles(UserRole.OWNER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.summary(from, to);
  }

  @Get('top-products')
  topProducts(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.topProducts(from, to);
  }

  @Get('top-customers')
  topCustomers(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.topCustomers(from, to);
  }

  @Get('sales-by-month')
  salesByMonth(@Query('year') year?: string) {
    return this.reports.salesByMonth(year ? Number(year) : new Date().getFullYear());
  }

  @Get('expenses-by-category')
  expensesByCategory(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.expensesByCategory(from, to);
  }
}
