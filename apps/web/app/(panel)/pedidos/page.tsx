'use client';

import Link from 'next/link';
import { formatCop } from '@lhdv/shared';
import { useApi } from '@/lib/use-api';
import { StatusBadge } from '@/app/components/StatusBadge';
import { CHANNEL_LABEL, formatDate } from '@/lib/labels';
import type { Order } from '@/lib/types';

export default function PedidosPage() {
  const { data: orders, loading, error } = useApi<Order[]>('/orders');

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pedidos</h1>
        <Link
          href="/pedidos/nuevo"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Nuevo pedido
        </Link>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {orders && orders.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-neutral-500 ring-1 ring-neutral-200">
          Todavía no hay pedidos. Creá el primero.
        </p>
      )}

      {orders && orders.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Entrega</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/pedidos/${o.id}`} className="text-blue-700 hover:underline">
                      {o.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {o.customer.name ?? '—'}
                    <span className="block text-xs text-neutral-400">{o.customer.whatsappPhone}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{CHANNEL_LABEL[o.channel]}</td>
                  <td className="px-4 py-3 text-neutral-600">{formatDate(o.deliveryDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCop(o.totalCop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
