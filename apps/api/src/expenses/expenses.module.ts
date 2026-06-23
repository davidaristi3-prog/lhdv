import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { RecurringExpensesService } from './recurring-expenses.service';
import { RecurringExpensesController } from './recurring-expenses.controller';

@Module({
  controllers: [ExpensesController, RecurringExpensesController],
  providers: [ExpensesService, RecurringExpensesService],
})
export class ExpensesModule {}
