'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { OrderStatus } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
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
  const [busyId, setBusyId] = useState<string | null>(null);

  async function advance(order: Order) {
    const step = FORWARD[order.status];
    if (!step) return;
    setBusyId(order.id);
    try {
      await api(`/orders/${order.id}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ to: step.to }),
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
      <h1 className="mb-5 text-lg font-semibold">Cocina · qué se produce hoy</h1>
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
                        <div className="flex items-center justify-between">
                          <Link href={`/pedidos/${o.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                            {o.code}
                          </Link>
                          <span className="text-xs text-neutral-400">{formatDate(o.deliveryDate)}</span>
                        </div>
                        <p className="text-xs text-neutral-500">{o.customer.name ?? o.customer.whatsappPhone}</p>
                        <ul className="mt-1.5 space-y-0.5 text-xs text-neutral-600">
                          {o.items.map((it) => (
                            <li key={it.id}>
                              {it.quantity}× {it.variant.product.name} · {it.variant.name}
                            </li>
                          ))}
                        </ul>
                        {step && (
                          <button
                            onClick={() => advance(o)}
                            disabled={busyId === o.id}
                            className="mt-2 w-full rounded-md bg-neutral-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                          >
                            {step.label} →
                          </button>
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
