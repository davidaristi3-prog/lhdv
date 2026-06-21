'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { OrderStatus } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth';
import { STATUS_LABEL, formatDate } from '@/lib/labels';
import type { Order } from '@/lib/types';

const COLUMNS: OrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'OUT_FOR_DELIVERY'];

const FORWARD: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  CONFIRMED: { to: 'IN_PRODUCTION', label: 'Iniciar' },
  IN_PRODUCTION: { to: 'READY', label: 'Marcar listo' },
  READY: { to: 'OUT_FOR_DELIVERY', label: 'Despachar' },
  OUT_FOR_DELIVERY: { to: 'DELIVERED', label: 'Entregar' },
};

export default function CocinaPage() {
  const { data: orders, loading, error, reload } = useApi<Order[]>('/orders/board');
  const { user } = useAuth();
  const readOnly = user?.role === 'SALES';
  const [busyId, setBusyId] = useState<string | null>(null);

  async function move(orderId: string, to: OrderStatus, scrap?: boolean) {
    setBusyId(orderId);
    try {
      await api(`/orders/${orderId}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ to, scrap }),
      });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Cocina · qué se produce hoy</h1>
        {readOnly && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Solo consulta
          </span>
        )}
      </div>
      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {orders && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const cards = orders.filter((o) => o.status === col);
            return (
              <div key={col} className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-neutral-700">{STATUS_LABEL[col]}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-neutral-500 ring-1 ring-neutral-200">
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {cards.map((o) => {
                    const step = FORWARD[o.status];
                    return (
                      <div key={o.id} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-neutral-200">
                        {/* Encabezado secundario: código + fecha (pequeño, tenue) */}
                        <div className="flex items-center justify-between text-xs text-neutral-400">
                          <Link href={`/pedidos/${o.id}`} className="font-medium text-blue-600 hover:underline">
                            {o.code}
                          </Link>
                          <span>{formatDate(o.deliveryDate)}</span>
                        </div>

                        {/* Lo que se produce: protagonista de la tarjeta */}
                        <ul className="mt-2 space-y-1.5">
                          {o.items.map((it) => (
                            <li key={it.id} className="flex items-baseline gap-2 leading-tight">
                              <span className="text-xl font-bold tabular-nums text-neutral-900">
                                {it.quantity}×
                              </span>
                              <span className="text-base font-semibold text-neutral-900">
                                {it.variant.product.name}
                                <span className="font-medium text-neutral-600"> · {it.variant.name}</span>
                              </span>
                            </li>
                          ))}
                        </ul>

                        {/* Cliente: secundario */}
                        <p className="mt-2 text-xs text-neutral-400">
                          {o.customer.name ?? o.customer.whatsappPhone}
                        </p>
                        {!readOnly && (step || o.status === 'IN_PRODUCTION') && (
                          <div className="mt-2 flex items-stretch gap-1.5">
                            {step && (
                              <button
                                onClick={() => move(o.id, step.to)}
                                disabled={busyId === o.id}
                                className="flex-1 rounded-md bg-neutral-900 px-2 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                              >
                                {step.label} →
                              </button>
                            )}
                            {o.status === 'IN_PRODUCTION' && (
                              <>
                                <button
                                  onClick={() => move(o.id, 'CONFIRMED')}
                                  disabled={busyId === o.id}
                                  className="rounded-md border border-neutral-300 px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                                  title="Devolver a Confirmado: repone los insumos (si te equivocaste y no se horneó)"
                                >
                                  Devolver
                                </button>
                                <button
                                  onClick={() => move(o.id, 'CONFIRMED', true)}
                                  disabled={busyId === o.id}
                                  className="rounded-md border border-red-200 px-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                                  title="Dar de baja: producto no apto. Vuelve a Confirmado para rehacerlo; los insumos usados NO se reponen (merma)."
                                >
                                  Baja
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-neutral-400">Sin pedidos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
