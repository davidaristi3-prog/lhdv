'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/labels';
import type { Order } from '@/lib/types';

/** Recoger en el local: pedidos listos que el cliente recoge (no pasan por domiciliario). */
export default function RecogerLocalPage() {
  const { data: orders, loading, error, reload } = useApi<Order[]>('/orders/board');
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendientes = (orders ?? []).filter((o) => o.status === 'READY' && o.deliveryType === 'PICKUP');

  // Igual que el botón de Pedidos: al recogerlo queda entregado.
  async function marcarRecogido(id: string) {
    setBusyId(id);
    try {
      await api(`/orders/${id}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ to: 'DELIVERED', reason: 'Recogido en el local' }),
      });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Pedidos listos para que el cliente los recoja en el local. Marcá “Recogido” cuando se los lleven.
      </p>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {orders && pendientes.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-neutral-400 ring-1 ring-neutral-200">
          No hay pedidos para recoger.
        </p>
      )}

      <div className="space-y-2">
        {pendientes.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-neutral-200"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/pedidos/${o.id}`} className="font-semibold text-blue-700 hover:underline">
                  {o.code}
                </Link>
                <span className="text-sm text-neutral-500">{o.customer.name ?? o.customer.whatsappPhone}</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-sm text-neutral-700">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-medium">{it.quantity}×</span> {it.variant.product.name} · {it.variant.name}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-neutral-400">Para {formatDate(o.deliveryDate)}</p>
            </div>
            <button
              onClick={() => marcarRecogido(o.id)}
              disabled={busyId === o.id}
              className="shrink-0 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyId === o.id ? '…' : '✓ Recogido'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
