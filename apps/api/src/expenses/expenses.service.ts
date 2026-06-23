import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dateRange } from '../common/date-range';
import { CreateExpenseDto, ExpenseLineInput, UpdateExpenseDto } from './dto/expense.dto';

/** Cómo se incluyen proveedor y renglones al listar/devolver un gasto. */
const withDetail = {
  supplier: { select: { id: true, name: true } },
  lines: { include: { ingredient: { select: { name: true, unit: true } } } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  list(from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where: { date: dateRange(from, to) },
      orderBy: { date: 'desc' },
      include: withDetail,
    });
  }

  /** Proveedores activos (para el autocompletar del formulario). */
  suppliers() {
    return this.prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  /**
   * Crea un gasto o una compra. Si trae `lines` (renglones de insumos), es una COMPRA:
   * sube el inventario y recalcula el costo de cada insumo por promedio ponderado, en una
   * sola transacción. Sin renglones, es un gasto normal.
   */
  async create(dto: CreateExpenseDto, userId: string) {
    const lines = (dto.lines ?? []).filter((l) => l.qtyBase > 0 || l.lineCop > 0);
    const isPurchase = lines.length > 0;

    return this.prisma.$transaction(async (tx) => {
      // Proveedor: se crea al vuelo si es nuevo (opcional).
      let supplierId: string | undefined;
      const supplierName = dto.supplierName?.trim();
      if (supplierName) {
        const supplier = await tx.supplier.upsert({
          where: { name: supplierName },
          update: {},
          create: { name: supplierName },
        });
        supplierId = supplier.id;
      }

      const amountCop = isPurchase
        ? lines.reduce((s, l) => s + l.lineCop, 0)
        : Math.round(dto.amountCop ?? 0);
      const description =
        dto.description?.trim() ||
        (isPurchase ? (supplierName ? `Compra a ${supplierName}` : 'Compra de insumos') : 'Gasto');

      const expense = await tx.expense.create({
        data: {
          date: new Date(dto.date),
          // Una compra de insumos siempre queda categorizada como INGREDIENTS; el gasto
          // usa la categoría elegida.
          category: isPurchase ? 'INGREDIENTS' : dto.category,
          description,
          amountCop,
          notes: dto.notes,
          invoiceNo: dto.invoiceNo?.trim() || undefined,
          supplierId,
          createdById: userId,
        },
      });

      for (const line of lines) {
        await this.applyPurchaseLine(tx, expense.id, line, dto.invoiceNo?.trim(), userId);
      }

      return tx.expense.findUniqueOrThrow({ where: { id: expense.id }, include: withDetail });
    });
  }

  /** Aplica un renglón de compra: recálculo de costo (WAC), stock y movimiento. */
  private async applyPurchaseLine(
    tx: Prisma.TransactionClient,
    expenseId: string,
    line: ExpenseLineInput,
    invoiceNo: string | undefined,
    userId: string,
  ) {
    const ing = await tx.ingredient.findUnique({
      where: { id: line.ingredientId },
      select: { stockQty: true, costPerUnitCop: true },
    });
    if (!ing) throw new NotFoundException(`Insumo no encontrado: ${line.ingredientId}`);

    const newStock = ing.stockQty + line.qtyBase;
    // Promedio ponderado móvil. Si no hay existencias previas (insumo nuevo), se usa el
    // precio de esta compra (último precio) como costo de apertura.
    let newCost = ing.costPerUnitCop;
    if (line.qtyBase > 0) {
      newCost =
        ing.stockQty > 0 && newStock > 0
          ? (ing.stockQty * ing.costPerUnitCop + line.lineCop) / newStock
          : line.lineCop / line.qtyBase;
    }

    await tx.ingredient.update({
      where: { id: line.ingredientId },
      data: { stockQty: newStock, costPerUnitCop: newCost },
    });

    const expenseLine = await tx.expenseLine.create({
      data: {
        expenseId,
        ingredientId: line.ingredientId,
        packLabel: line.packLabel?.trim() || undefined,
        qtyBase: line.qtyBase,
        lineCop: line.lineCop,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        ingredientId: line.ingredientId,
        type: 'PURCHASE',
        quantity: line.qtyBase,
        reason: invoiceNo ? `Compra factura ${invoiceNo}` : 'Compra',
        expenseLineId: expenseLine.id,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const existing = await this.prisma.expense.findUnique({
      where: { id },
      select: { recurringId: true },
    });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    // Un gasto causado desde un fijo no debe cambiar de categoría ni de fecha (rompería el
    // candado por mes y los reportes); solo se ajustan monto/descripción/notas.
    const locked = existing.recurringId != null;
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...dto,
        category: locked ? undefined : dto.category,
        date: locked ? undefined : dto.date ? new Date(dto.date) : undefined,
      },
      include: withDetail,
    });
  }

  /**
   * Elimina un gasto. Si era una compra (con renglones), revierte el inventario: descuenta
   * lo que había entrado y deja un movimiento de anulación. No recalcula el costo hacia
   * atrás (caso raro, aceptable): para corregir un precio se anula y se vuelve a registrar.
   */
  async remove(id: string, userId: string) {
    const found = await this.prisma.expense.findUnique({ where: { id }, include: { lines: true } });
    if (!found) throw new NotFoundException('Gasto no encontrado');

    await this.prisma.$transaction(async (tx) => {
      for (const line of found.lines) {
        await tx.ingredient.update({
          where: { id: line.ingredientId },
          data: { stockQty: { decrement: line.qtyBase } },
        });
        await tx.inventoryMovement.create({
          data: {
            ingredientId: line.ingredientId,
            type: 'ADJUSTMENT',
            quantity: line.qtyBase,
            reason: 'Anulación de compra',
            expenseLineId: line.id,
            createdById: userId,
          },
        });
      }
      await tx.expense.delete({ where: { id } }); // borra los renglones en cascada
    });
    return { deleted: true };
  }
}
