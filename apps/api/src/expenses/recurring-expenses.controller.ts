import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RecurringExpensesService } from './recurring-expenses.service';
import {
  CauseBatchDto,
  CauseDto,
  CreateRecurringDto,
  UpdateRecurringDto,
} from './dto/recurring-expense.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';

@Roles(UserRole.OWNER)
@Controller('recurring-expenses')
export class RecurringExpensesController {
  constructor(private readonly recurring: RecurringExpensesService) {}

  @Get()
  list(@Query('month') month?: string) {
    return this.recurring.list(month);
  }

  @Post()
  create(@Body() dto: CreateRecurringDto) {
    return this.recurring.create(dto);
  }

  @Post('cause-batch')
  causeBatch(@Body() dto: CauseBatchDto, @CurrentUser() user: JwtPayload) {
    return this.recurring.causeBatch(dto, user.sub);
  }

  @Post(':id/cause')
  cause(@Param('id') id: string, @Body() dto: CauseDto, @CurrentUser() user: JwtPayload) {
    return this.recurring.cause(id, dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecurringDto) {
    return this.recurring.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recurring.remove(id);
  }
}
