'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { StatusBadge } from '@/app/components/StatusBadge';
import { CHANNEL_LABEL, formatDate } from '@/lib/labels';
import type { Order } from '@/lib/types';

type Tab = 'activos' | 'borradores' | 'entregados';

// Estados terminales/cerrados → pestaña "Entregados" (incluye cancelados).
const CLOSED = ['DELIVERED', 'CANCELLED'];

function groupOf(status: string): Tab {
  if (status === 'DRAFT') return 'borradores';
  if (CLOSED.includes(status)) return 'entregados';
  return 'activos';
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'borradores', label: 'Borradores' },
  { key: 'entregados', label: 'Entregados' },
];

export default function PedidosPage() {
  const { data: orders, loading, error, reload } = useApi<Order[]>('/orders');
  const [tab, setTab] = useState<Tab>('activos');
  const [busyId, setBusyId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const g: Record<Tab, Order[]> = { activos: [], borradores: [], entregados: [] };
    (orders ?? []).forEach((o) => g[groupOf(o.status)].push(o));
    return g;
  }, [orders]);

  const visible = groups[tab];

  async function enviarACocina(id: string) {
    setBusyId(id);
    try {
      await api(`/orders/${id}/confirm`, { method: 'POST' });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

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

      {/* Pestañas: Activos (lo que importa) · Borradores (a la mano) · Entregados (archivo) */}
      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                tab === t.key ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {groups[t.key].length}
            </span>
          </button>
        ))}
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {orders && visible.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-neutral-500 ring-1 ring-neutral-200">
          {tab === 'borradores'
            ? 'No hay borradores. Los pedidos que guardés sin enviar a cocina aparecen acá.'
            : tab === 'entregados'
              ? 'Todavía no hay pedidos entregados.'
              : 'No hay pedidos activos. Creá uno nuevo.'}
        </p>
      )}

      {orders && visible.length > 0 && (
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
                {tab === 'borradores' && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visible.map((o) => (
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
                  {tab === 'borradores' && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/pedidos/${o.id}`}
                          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          Abrir
                        </Link>
                        <button
                          onClick={() => enviarACocina(o.id)}
                          disabled={busyId === o.id}
                          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                        >
                          {busyId === o.id ? 'Enviando…' : 'Enviar a cocina'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
