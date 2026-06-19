import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dateRange } from '../common/date-range';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  list(from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where: { date: dateRange(from, to) },
      orderBy: { date: 'desc' },
    });
  }

  create(dto: CreateExpenseDto, userId: string) {
    return this.prisma.expense.create({
      data: {
        date: new Date(dto.date),
        category: dto.category,
        description: dto.description,
        amountCop: dto.amountCop,
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.ensure(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.ensure(id);
    await this.prisma.expense.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensure(id: string) {
    const found = await this.prisma.expense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Gasto no encontrado');
  }
}
