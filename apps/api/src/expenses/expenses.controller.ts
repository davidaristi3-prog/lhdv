import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Roles(UserRole.OWNER)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.expenses.list(from, to);
  }

  @Get('suppliers')
  suppliers() {
    return this.expenses.suppliers();
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtPayload) {
    return this.expenses.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.expenses.remove(id, user.sub);
  }
}
