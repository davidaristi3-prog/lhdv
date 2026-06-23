import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecurringExpense } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CauseBatchDto,
  CauseDto,
  CreateRecurringDto,
  UpdateRecurringDto,
} from './dto/recurring-expense.dto';

/** Rango [inicio, fin) del mes calendario de una fecha (en UTC). */
function monthRange(d: Date) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Clave 'YYYY-MM' (UTC) del mes de una fecha — alimenta el candado anti-duplicado. */
function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** El índice único (recurringId, causedMonth) saltó: ya se causó ese mes. */
function isDuplicateMonth(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

@Injectable()
export class RecurringExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Plantillas activas + si ya se causaron en el mes indicado (YYYY-MM; por defecto, el actual). */
  async list(month?: string) {
    const ref = month ? new Date(`${month}-01T00:00:00Z`) : new Date();
    const { start, end } = monthRange(ref);
    const templates = await this.prisma.recurringExpense.findMany({
      where: { active: true },
      orderBy: { description: 'asc' },
    });
    const caused = await this.prisma.expense.findMany({
      where: { recurringId: { in: templates.map((t) => t.id) }, date: { gte: start, lt: end } },
      select: { id: true, recurringId: true, amountCop: true, date: true },
    });
    const byRec = new Map(caused.map((c) => [c.recurringId, c]));
    return templates.map((t) => {
      const c = byRec.get(t.id);
      return {
        ...t,
        causedThisMonth: !!c,
        causedExpense: c ? { id: c.id, amountCop: c.amountCop, date: c.date } : null,
      };
    });
  }

  create(dto: CreateRecurringDto) {
    return this.prisma.recurringExpense.create({
      data: {
        description: dto.description.trim(),
        category: dto.category,
        amountCop: dto.amountCop,
        supplierName: dto.supplierName?.trim() || null,
        dayOfMonth: dto.dayOfMonth ?? null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(id: string, dto: UpdateRecurringDto) {
    await this.ensure(id);
    return this.prisma.recurringExpense.update({
      where: { id },
      data: {
        description: dto.description?.trim(),
        category: dto.category,
        amountCop: dto.amountCop,
        supplierName:
          dto.supplierName === undefined ? undefined : dto.supplierName.trim() || null,
        dayOfMonth: dto.dayOfMonth,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.ensure(id);
    await this.prisma.recurringExpense.delete({ where: { id } }); // Expense.recurringId -> SET NULL
    return { deleted: true };
  }

  /** Causa un gasto fijo: crea el Expense del mes con el monto confirmado (anti-duplicado). */
  async cause(id: string, dto: CauseDto, userId: string) {
    const tmpl = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!tmpl) throw new NotFoundException('Gasto fijo no encontrado');
    const date = dto.date ? new Date(dto.date) : new Date();
    if (await this.alreadyCaused(id, date)) {
      throw new BadRequestException('Ese gasto fijo ya se causó este mes.');
    }
    try {
      return await this.createExpenseFromTemplate(tmpl, dto.amountCop, date, userId);
    } catch (e) {
      // Carrera (doble clic / 2 pestañas): el índice único frena el segundo.
      if (isDuplicateMonth(e)) throw new BadRequestException('Ese gasto fijo ya se causó este mes.');
      throw e;
    }
  }

  /** Causa varios de una (omite los inexistentes o ya causados este mes). */
  async causeBatch(dto: CauseBatchDto, userId: string) {
    const date = dto.date ? new Date(dto.date) : new Date();
    const { start, end } = monthRange(date);
    const ids = dto.items.map((i) => i.recurringId);
    const [templates, already] = await Promise.all([
      this.prisma.recurringExpense.findMany({ where: { id: { in: ids } } }),
      this.prisma.expense.findMany({
        where: { recurringId: { in: ids }, date: { gte: start, lt: end } },
        select: { recurringId: true },
      }),
    ]);
    const tmap = new Map(templates.map((t) => [t.id, t]));
    const done = new Set(already.map((a) => a.recurringId));
    let created = 0;
    for (const item of dto.items) {
      const tmpl = tmap.get(item.recurringId);
      if (!tmpl || done.has(item.recurringId)) continue;
      done.add(item.recurringId); // no duplicar si el mismo id viene repetido en el request
      try {
        await this.createExpenseFromTemplate(tmpl, item.amountCop, date, userId);
        created++;
      } catch (e) {
        if (!isDuplicateMonth(e)) throw e; // ya causado (carrera) → se omite
      }
    }
    return { created };
  }

  private async alreadyCaused(recurringId: string, date: Date) {
    const { start, end } = monthRange(date);
    const existing = await this.prisma.expense.findFirst({
      where: { recurringId, date: { gte: start, lt: end } },
      select: { id: true },
    });
    return !!existing;
  }

  private async createExpenseFromTemplate(
    tmpl: RecurringExpense,
    amountCop: number,
    date: Date,
    userId: string,
  ) {
    let supplierId: string | undefined;
    const name = tmpl.supplierName?.trim();
    if (name) {
      const sup = await this.prisma.supplier.upsert({ where: { name }, update: {}, create: { name } });
      supplierId = sup.id;
    }
    return this.prisma.expense.create({
      data: {
        date,
        category: tmpl.category,
        description: tmpl.description,
        amountCop,
        supplierId,
        recurringId: tmpl.id,
        causedMonth: monthKey(date),
        createdById: userId,
      },
    });
  }

  private async ensure(id: string) {
    const found = await this.prisma.recurringExpense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Gasto fijo no encontrado');
  }
}
