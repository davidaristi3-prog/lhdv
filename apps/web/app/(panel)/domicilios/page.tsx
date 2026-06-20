'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/labels';
import type { DeliveryRoute, Order, RouteStatus } from '@/lib/types';

const ROUTE_LABEL: Record<RouteStatus, string> = {
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En ruta',
  DONE: 'Completada',
};
const ROUTE_STYLE: Record<RouteStatus, string> = {
  DRAFT: 'bg-neutral-200 text-neutral-700',
  IN_PROGRESS: 'bg-teal-100 text-teal-800',
  DONE: 'bg-emerald-100 text-emerald-800',
};

interface PanelUser {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function DomiciliosPage() {
  const router = useRouter();
  const available = useApi<Order[]>('/routes/available');
  const routes = useApi<DeliveryRoute[]>('/routes');
  const { data: users } = useApi<PanelUser[]>('/users');

  const couriers = (users ?? []).filter((u) => u.role === 'DELIVERY' && u.active);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierId, setCourierId] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createRoute() {
    setError(null);
    setBusy(true);
    try {
      const route = await api<DeliveryRoute>('/routes', {
        method: 'POST',
        body: JSON.stringify({
          date,
          courierId: courierId || undefined,
          orderIds: Array.from(selected),
        }),
      });
      router.push(`/domicilios/${route.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Domicilios</h1>

      {/* Armar ruta */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-neutral-200">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Armar ruta</h2>
        {available.data && available.data.length === 0 && (
          <p className="text-sm text-neutral-400">No hay pedidos listos para despachar.</p>
        )}
        <div className="space-y-2">
          {available.data?.map((o) => {
            const addr = o.customerAddress?.address ?? o.deliveryAddress ?? '—';
            return (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-3 text-sm hover:bg-neutral-50"
              >
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                <span className="font-medium">{o.code}</span>
                <span className="text-neutral-500">{o.customer.name ?? o.customer.whatsappPhone}</span>
                <span className="ml-auto truncate text-neutral-500">
                  {addr}
                  {o.deliveryZone ? ` · ${o.deliveryZone}` : ''}
                </span>
              </label>
            );
          })}
        </div>

        {available.data && available.data.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
            <select value={courierId} onChange={(e) => setCourierId(e.target.value)} className={field}>
              <option value="">Domiciliario…</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            <button
              onClick={createRoute}
              disabled={busy || selected.size === 0}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              {busy ? 'Armando…' : `Crear ruta (${selected.size})`}
            </button>
            <span className="text-xs text-neutral-400">Se ordena por cercanía automáticamente.</span>
            {error && <span className="w-full text-sm text-red-700">{error}</span>}
          </div>
        )}
      </div>

      {/* Rutas */}
      <div className="rounded-xl bg-white ring-1 ring-neutral-200">
        <h2 className="border-b border-neutral-100 px-5 py-3 text-sm font-semibold text-neutral-700">Rutas</h2>
        {routes.data && routes.data.length === 0 && (
          <p className="p-5 text-sm text-neutral-400">Todavía no hay rutas.</p>
        )}
        <div className="divide-y divide-neutral-100">
          {routes.data?.map((r) => (
            <Link
              key={r.id}
              href={`/domicilios/${r.id}`}
              className="flex items-center justify-between px-5 py-3 text-sm hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROUTE_STYLE[r.status]}`}>
                  {ROUTE_LABEL[r.status]}
                </span>
                <span className="text-neutral-600">{formatDate(r.date)}</span>
                <span className="text-neutral-500">{r.courier?.name ?? 'Sin asignar'}</span>
              </div>
              <span className="text-neutral-400">{r._count?.orders ?? 0} paradas</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
