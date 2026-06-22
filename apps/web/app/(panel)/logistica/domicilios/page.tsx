'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/labels';
import type { DeliveryRoute, Order, RouteStatus, SuggestResponse } from '@/lib/types';

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
// ¿La fecha de entrega es de mañana o después? (para marcar pedidos adelantados)
function isFuture(d: string | null | undefined): boolean {
  if (!d) return false;
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Date(d) >= tomorrow;
}
const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

export default function DomiciliosPage() {
  const router = useRouter();
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const available = useApi<Order[]>(`/routes/available${includeUpcoming ? '?upcoming=true' : ''}`);
  const routes = useApi<DeliveryRoute[]>('/routes');
  const { data: users } = useApi<PanelUser[]>('/users');

  const couriers = (users ?? []).filter((u) => u.role === 'DELIVERY' && u.active);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierId, setCourierId] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());

  function toggleMerge(id: string) {
    setMergeSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function mergeRoutes() {
    const ids = [...mergeSel];
    if (ids.length < 2) return;
    setBusy(true);
    try {
      // La primera es el destino; el resto se vuelcan en ella y se recalcula el orden.
      const [target, ...sources] = ids;
      for (const src of sources) {
        await api(`/routes/${target}/merge/${src}`, { method: 'POST' });
      }
      setMergeSel(new Set());
      routes.reload();
      available.reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function refreshAll() {
    available.reload();
    routes.reload();
  }

  async function createRoute() {
    setError(null);
    setBusy(true);
    try {
      const route = await api<DeliveryRoute>('/routes', {
        method: 'POST',
        body: JSON.stringify({ date, courierId: courierId || undefined, orderIds: Array.from(selected) }),
      });
      router.push(`/logistica/domicilios/${route.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Rutas marcadas para juntar; deben ser del mismo domiciliario (el backend lo revalida).
  const selRoutes = (routes.data ?? []).filter((r) => mergeSel.has(r.id));
  const canMerge =
    selRoutes.length >= 2 &&
    selRoutes[0].courierId != null &&
    selRoutes.every((r) => r.courierId === selRoutes[0].courierId);

  return (
    <div className="space-y-6">
      {/* Sugerencia automática por zona y capacidad */}
      <SugerenciaRutas
        couriers={couriers}
        date={date}
        includeUpcoming={includeUpcoming}
        onCreated={refreshAll}
      />

      {/* Armar ruta manual */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-neutral-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">Armar ruta manual</h2>
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={includeUpcoming}
              onChange={(e) => setIncludeUpcoming(e.target.checked)}
            />
            Incluir próximos días (para adelantar)
          </label>
        </div>
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
                {isFuture(o.deliveryDate) && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    para {formatDate(o.deliveryDate)}
                  </span>
                )}
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
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-700">Rutas</h2>
          {canMerge ? (
            <button
              onClick={mergeRoutes}
              disabled={busy}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              🔗 Juntar {selRoutes.length} rutas
            </button>
          ) : mergeSel.size >= 2 ? (
            <span className="text-xs text-amber-600">Deben ser del mismo domiciliario</span>
          ) : mergeSel.size === 1 ? (
            <span className="text-xs text-neutral-400">Marcá otra ruta del mismo domiciliario</span>
          ) : null}
        </div>
        {routes.data && routes.data.length === 0 && (
          <p className="p-5 text-sm text-neutral-400">Todavía no hay rutas.</p>
        )}
        <div className="divide-y divide-neutral-100">
          {routes.data?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-neutral-50">
              {r.status === 'DRAFT' ? (
                <input
                  type="checkbox"
                  checked={mergeSel.has(r.id)}
                  onChange={() => toggleMerge(r.id)}
                  title="Marcar para juntar con otra ruta del mismo domiciliario"
                  className="shrink-0"
                />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <Link
                href={`/logistica/domicilios/${r.id}`}
                className="flex flex-1 items-center justify-between"
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Propuesta de asignación por zona/capacidad, editable, que crea una ruta por domiciliario. */
function SugerenciaRutas({
  couriers,
  date,
  includeUpcoming,
  onCreated,
}: {
  couriers: { id: string; name: string }[];
  date: string;
  includeUpcoming: boolean;
  onCreated: () => void;
}) {
  const { data, loading, reload } = useApi<SuggestResponse>(
    `/routes/suggest${includeUpcoming ? '?upcoming=true' : ''}`,
  );
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const init: Record<string, string> = {};
    for (const g of data.groups) for (const o of g.orders) init[o.id] = g.courier.id;
    for (const u of data.unassigned) init[u.order.id] = '';
    setAssign(init);
  }, [data]);

  if (loading || !data) return null;
  const allOrders = [...data.groups.flatMap((g) => g.orders), ...data.unassigned.map((u) => u.order)];
  if (allOrders.length === 0) return null;

  const byCourier = new Map<string, string[]>();
  for (const [orderId, cid] of Object.entries(assign)) {
    if (!cid) continue;
    byCourier.set(cid, [...(byCourier.get(cid) ?? []), orderId]);
  }

  async function confirm() {
    setBusy(true);
    try {
      for (const [cid, orderIds] of byCourier.entries()) {
        await api('/routes', { method: 'POST', body: JSON.stringify({ date, courierId: cid, orderIds }) });
      }
      onCreated();
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-neutral-200">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Sugerencia automática por zona</h2>
        <button onClick={() => reload()} className="text-xs text-blue-700 hover:underline">
          Recalcular
        </button>
      </div>
      <p className="mb-3 text-xs text-neutral-400">
        Se sugiere un domiciliario por la zona del pedido respetando su capacidad. Podés reasignar antes de crear.
      </p>
      <div className="space-y-2">
        {allOrders.map((o) => {
          const reason = data.unassigned.find((u) => u.order.id === o.id)?.reason;
          const cid = assign[o.id] ?? '';
          return (
            <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
              <span className="font-medium">{o.code}</span>
              <span className="text-neutral-500">{o.deliveryZone ?? 'sin zona'}</span>
              <select
                value={cid}
                onChange={(e) => setAssign((a) => ({ ...a, [o.id]: e.target.value }))}
                className="ml-auto rounded-lg border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="">— sin asignar</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {reason && !cid && (
                <span className="w-full text-xs text-amber-600">
                  {reason === 'zona_sin_domiciliario'
                    ? 'Ningún domiciliario cubre esta zona'
                    : 'Sin capacidad disponible'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
        <button
          onClick={confirm}
          disabled={busy || byCourier.size === 0}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? 'Creando…' : `Crear ${byCourier.size} ruta(s) sugerida(s)`}
        </button>
        <span className="text-xs text-neutral-400">Cada ruta se ordena por cercanía.</span>
      </div>
    </div>
  );
}
