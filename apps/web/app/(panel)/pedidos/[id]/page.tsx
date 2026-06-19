'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCop, nextStatuses } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { StatusBadge } from '@/app/components/StatusBadge';
import {
  CHANNEL_LABEL,
  DELIVERY_LABEL,
  STATUS_LABEL,
  formatDate,
  formatDateTime,
} from '@/lib/labels';
import type { Order } from '@/lib/types';

export default function PedidoDetallePage() {
  const params = useParams<{ id: string }>();
  const { data: order, loading, error, reload } = useApi<Order>(`/orders/${params.id}`);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function transition(to: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/orders/${params.id}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ to, reason: reason || undefined }),
      });
      setReason('');
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!order) return null;

  const nexts = nextStatuses(order.status);
  const card = 'rounded-xl bg-white p-5 ring-1 ring-neutral-200';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/pedidos" className="text-sm text-neutral-500 hover:underline">
            ← Pedidos
          </Link>
          <h1 className="text-lg font-semibold">{order.code}</h1>
          <StatusBadge status={order.status} />
          {order.isCustom && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
              Personalizado
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className={card}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Cliente</h2>
          <p>{order.customer.name ?? '—'}</p>
          <p className="text-neutral-500">{order.customer.whatsappPhone}</p>
        </div>
        <div className={card}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Entrega</h2>
          <p>{order.deliveryType ? DELIVERY_LABEL[order.deliveryType] : '—'}</p>
          <p className="text-neutral-500">{formatDate(order.deliveryDate)}</p>
          {order.deliveryAddress && <p className="text-neutral-500">{order.deliveryAddress}</p>}
          <p className="mt-1 text-xs text-neutral-400">Canal: {CHANNEL_LABEL[order.channel]}</p>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Productos</h2>
        <div className="divide-y divide-neutral-100">
          {order.items.map((it) => (
            <div key={it.id} className="flex items-start justify-between py-2 text-sm">
              <div>
                <p className="font-medium">
                  {it.quantity}× {it.variant.product.name} · {it.variant.name}
                </p>
                {it.customText && <p className="text-neutral-500">“{it.customText}”</p>}
                {it.additions && it.additions.length > 0 && (
                  <p className="text-xs text-neutral-400">
                    + {it.additions.map((a) => a.addition.name).join(', ')}
                  </p>
                )}
              </div>
              <span className="text-neutral-600">{formatCop(it.unitPriceCop * it.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
          <div className="flex justify-between text-neutral-500">
            <span>Subtotal</span>
            <span>{formatCop(order.subtotalCop)}</span>
          </div>
          {order.deliveryCostCop > 0 && (
            <div className="flex justify-between text-neutral-500">
              <span>Domicilio</span>
              <span>{formatCop(order.deliveryCostCop)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatCop(order.totalCop)}</span>
          </div>
        </div>
        {order.notes && <p className="mt-3 text-sm text-neutral-500">Nota: {order.notes}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Cambiar estado</h2>
        {nexts.length === 0 ? (
          <p className="text-sm text-neutral-500">Este pedido está en un estado final.</p>
        ) : (
          <>
            <input
              placeholder="Motivo (opcional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <div className="flex flex-wrap gap-2">
              {nexts.map((s) => (
                <button
                  key={s}
                  onClick={() => transition(s)}
                  disabled={busy}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-900 hover:text-white disabled:opacity-50"
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </>
        )}
        {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Historial</h2>
        <ol className="space-y-2 text-sm">
          {order.statusEvents?.map((e) => (
            <li key={e.id} className="flex items-center justify-between">
              <span>
                {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} → ` : ''}
                <span className="font-medium">{STATUS_LABEL[e.toStatus]}</span>
                {e.reason && <span className="text-neutral-400"> · {e.reason}</span>}
              </span>
              <span className="text-xs text-neutral-400">{formatDateTime(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
