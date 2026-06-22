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
  const [entregar, setEntregar] = useState<Order | null>(null);
  const [nombre, setNombre] = useState('');
  const [obs, setObs] = useState('');

  const pendientes = (orders ?? []).filter((o) => o.status === 'READY' && o.deliveryType === 'PICKUP');

  function abrir(o: Order) {
    setEntregar(o);
    setNombre('');
    setObs('');
  }

  // Entregar deja evidencia de quién recibió (obligatorio) y una observación opcional,
  // guardadas en el motivo del evento del pedido.
  async function confirmar() {
    if (!entregar || !nombre.trim()) return;
    setBusyId(entregar.id);
    try {
      const reason = `Recogido por ${nombre.trim()}${obs.trim() ? ` · ${obs.trim()}` : ''}`;
      await api(`/orders/${entregar.id}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ to: 'DELIVERED', reason }),
      });
      setEntregar(null);
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
        Pedidos listos para que el cliente los recoja en el local. Tocá “Entregar” cuando se lo lleven.
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
              onClick={() => abrir(o)}
              disabled={busyId === o.id}
              className="shrink-0 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Entregar
            </button>
          </div>
        ))}
      </div>

      {/* Aviso de confirmación: evidencia de quién recibió + observación. */}
      {entregar && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEntregar(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold">Confirmar entrega · {entregar.code}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {entregar.customer.name ?? entregar.customer.whatsappPhone}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">¿Quién lo recibió? *</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre de quien recoge"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Observación (opcional)</label>
                <input
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Alguna nota…"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setEntregar(null)}
                className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!nombre.trim() || busyId === entregar.id}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {busyId === entregar.id ? 'Guardando…' : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
