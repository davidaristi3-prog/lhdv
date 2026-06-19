import type { OrderStatus } from '@lhdv/shared';
import type { Channel, DeliveryType, Role } from './types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_CONFIRMATION: 'Por confirmar',
  AWAITING_PAYMENT: 'Esperando pago',
  CONFIRMED: 'Confirmado',
  IN_PRODUCTION: 'En producción',
  READY: 'Listo',
  OUT_FOR_DELIVERY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  NEEDS_HUMAN: 'Atención humana',
};

/** Clases Tailwind para el badge de cada estado. */
export const STATUS_STYLE: Record<OrderStatus, string> = {
  DRAFT: 'bg-neutral-200 text-neutral-700',
  PENDING_CONFIRMATION: 'bg-amber-100 text-amber-800',
  AWAITING_PAYMENT: 'bg-orange-100 text-orange-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  IN_PRODUCTION: 'bg-indigo-100 text-indigo-800',
  READY: 'bg-green-100 text-green-800',
  OUT_FOR_DELIVERY: 'bg-teal-100 text-teal-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-700',
  NEEDS_HUMAN: 'bg-rose-100 text-rose-800',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual',
  RAPPI: 'Rappi',
};

export const DELIVERY_LABEL: Record<DeliveryType, string> = {
  PICKUP: 'Recoge en el local',
  OWN_COURIER: 'Mensajero propio',
  EXPRESS_APP: 'Domicilio rápido',
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dueña',
  KITCHEN: 'Cocina',
  SALES: 'Ventas',
  DELIVERY: 'Domicilios',
};

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
