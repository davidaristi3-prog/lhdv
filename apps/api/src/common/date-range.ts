import { Prisma } from '@prisma/client';

/**
 * Filtro de rango de fechas para Prisma a partir de strings `YYYY-MM-DD`.
 * `to` es inclusivo (suma un día y usa `lt`). Devuelve undefined si no hay rango.
 */
export function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(`${from}T00:00:00`);
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    filter.lt = end;
  }
  return filter;
}
