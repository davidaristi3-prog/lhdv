/**
 * Dinero en pesos colombianos (COP).
 *
 * Guardamos importes como ENTEROS de pesos (no centavos): el peso colombiano
 * no usa fracción en la práctica. Trabajar con enteros evita errores de
 * redondeo de punto flotante.
 */

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Formatea un entero de pesos como "$ 45.000". */
export function formatCop(pesos: number): string {
  return copFormatter.format(pesos);
}

export interface LineLike {
  unitPriceCop: number;
  quantity: number;
  additionsCop?: number; // suma de adiciones de la línea (ya por la cantidad si aplica)
}

/** Total de una línea: (precio unitario × cantidad) + adiciones. */
export function lineTotalCop(line: LineLike): number {
  return line.unitPriceCop * line.quantity + (line.additionsCop ?? 0);
}

/** Subtotal de un pedido a partir de sus líneas. */
export function subtotalCop(lines: LineLike[]): number {
  return lines.reduce((acc, l) => acc + lineTotalCop(l), 0);
}
