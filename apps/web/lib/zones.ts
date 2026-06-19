import type { DeliveryZone } from './types';

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS, ''); // minúsculas sin acentos
}

/**
 * Detecta la zona de domicilio a partir del texto de una dirección, buscando el
 * nombre del municipio o alguno de sus barrios/alias. Primer paso hacia el cálculo
 * automático (la versión con mapa vendría después).
 */
export function detectZone(text: string, zones: DeliveryZone[]): DeliveryZone | null {
  if (!text) return null;
  const t = normalizeText(text);
  for (const z of zones) {
    if (t.includes(normalizeText(z.name))) return z;
    if (z.aliases.some((a) => a && t.includes(normalizeText(a)))) return z;
  }
  return null;
}
