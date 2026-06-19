/**
 * Máquina de estados del pedido — La Hora del Venado.
 *
 * Fuente de verdad del ciclo de vida de un pedido. Tanto el panel (entrada
 * manual, Fase 1) como el bot de WhatsApp (Fase 2) y los webhooks de pago
 * (Fase 3) deben pasar SIEMPRE por aquí para cambiar de estado. Nunca se
 * escribe `order.status` a mano sin validar la transición.
 */

export const ORDER_STATUSES = [
  'DRAFT', // Borrador: el pedido se está armando (bot o panel)
  'PENDING_CONFIRMATION', // Esperando que el cliente confirme el resumen
  'AWAITING_PAYMENT', // Confirmado por el cliente, esperando pago
  'CONFIRMED', // Pago verificado → habilitado para producción
  'IN_PRODUCTION', // En cocina
  'READY', // Listo para entrega/recogida
  'OUT_FOR_DELIVERY', // En camino
  'DELIVERED', // Entregado (terminal)
  'CANCELLED', // Cancelado (terminal)
  'NEEDS_HUMAN', // Escalado a una persona (reclamo, caso fuera de alcance)
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Estados terminales: no admiten más transiciones. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED'];

/**
 * Estados de producción/entrega que maneja la cocina. El rol de Ventas los ve
 * (para informar al cliente) pero NO puede moverlos: solo consulta.
 */
export const PRODUCTION_STATUSES: readonly OrderStatus[] = [
  'IN_PRODUCTION',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function isProductionStatus(status: OrderStatus): boolean {
  return PRODUCTION_STATUSES.includes(status);
}

/**
 * Transiciones permitidas. La clave es el estado actual; el valor, los
 * estados a los que puede pasar.
 *
 * Reglas duras codificadas aquí:
 *  - A IN_PRODUCTION sólo se llega desde CONFIRMED → ningún pedido entra a
 *    producción sin pago verificado (Fase 3).
 *  - Casi cualquier estado operativo puede escalar a NEEDS_HUMAN o cancelarse.
 *  - DELIVERED y CANCELLED son terminales.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['PENDING_CONFIRMATION', 'NEEDS_HUMAN', 'CANCELLED'],
  PENDING_CONFIRMATION: ['AWAITING_PAYMENT', 'DRAFT', 'NEEDS_HUMAN', 'CANCELLED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'NEEDS_HUMAN', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'NEEDS_HUMAN', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'NEEDS_HUMAN', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'NEEDS_HUMAN'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'NEEDS_HUMAN'],
  DELIVERED: [],
  CANCELLED: [],
  // Desde el escalamiento, una persona puede devolver el pedido al flujo
  // operativo o cerrarlo. No puede saltar directo a producción sin pasar por
  // el control de pago.
  NEEDS_HUMAN: [
    'DRAFT',
    'PENDING_CONFIRMATION',
    'AWAITING_PAYMENT',
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY',
    'CANCELLED',
  ],
};

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(
      `Transición de pedido inválida: ${from} → ${to}. ` +
        `Desde ${from} sólo se permite: ${nextStatuses(from).join(', ') || '(ninguna, estado terminal)'}.`,
    );
    this.name = 'InvalidTransitionError';
  }
}

/** Lanza InvalidTransitionError si la transición no está permitida. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
