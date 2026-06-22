'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, API_ORIGIN } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDateTime } from '@/lib/labels';
import type { DeliveryRoute, Order } from '@/lib/types';
import type { MapStop } from '@/app/components/DeliveryMap';

const DeliveryMap = dynamic(
  () => import('@/app/components/DeliveryMap').then((m) => m.DeliveryMap),
  { ssr: false, loading: () => <div className="h-[360px] w-full rounded-xl bg-neutral-100" /> },
);

export default function RutaDetallePage() {
  const params = useParams<{ id: string }>();
  const { data: route, loading, error, reload } = useApi<DeliveryRoute>(`/routes/${params.id}`);
  const available = useApi<Order[]>('/routes/available');
  const [busy, setBusy] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setInterval(() => void reload(), 12000); // ubicación en vivo
    return () => clearInterval(t);
  }, [reload]);

  async function action(path: string) {
    setBusy(true);
    try {
      await api(path, { method: 'POST' });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Sacar un pedido de la ruta (vuelve a disponibles) — solo antes de salir.
  async function removeOrder(orderId: string) {
    setBusy(true);
    try {
      await api(`/routes/${params.id}/orders/${orderId}/remove`, { method: 'POST' });
      await reload();
      await available.reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Añadir pedidos disponibles a esta ruta — solo antes de salir.
  async function addOrders() {
    if (toAdd.size === 0) return;
    setBusy(true);
    try {
      await api(`/routes/${params.id}/add`, {
        method: 'POST',
        body: JSON.stringify({ orderIds: [...toAdd] }),
      });
      setToAdd(new Set());
      await reload();
      await available.reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!route) return null;

  const stops: MapStop[] = route.orders
    .filter((o) => o.customerAddress?.lat != null && o.customerAddress?.lng != null)
    .map((o) => ({
      lat: o.customerAddress!.lat as number,
      lng: o.customerAddress!.lng as number,
      label: `${o.code} — ${o.customer.name ?? o.customer.whatsappPhone}`,
      seq: o.routeSeq ?? 0,
      done: o.status === 'DELIVERED',
    }));
  const courier =
    route.courierLat != null && route.courierLng != null
      ? { lat: route.courierLat, lng: route.courierLng }
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/logistica/domicilios" className="text-sm text-neutral-500 hover:underline">
          ← Domicilios
        </Link>
        <h1 className="text-lg font-semibold">Ruta · {route.courier?.name ?? 'Sin asignar'}</h1>
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
          {route.orders.length} paradas
        </span>
        {route.courierAt && (
          <span className="text-xs text-neutral-400">
            Domiciliario visto {formatDateTime(route.courierAt)}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {route.status === 'DRAFT' && (
            <>
              <button
                onClick={() => action(`/routes/${route.id}/reorder`)}
                disabled={busy}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
              >
                Reordenar
              </button>
              <button
                onClick={() => action(`/routes/${route.id}/start`)}
                disabled={busy}
                className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Iniciar ruta
              </button>
            </>
          )}
          {route.status === 'IN_PROGRESS' && (
            <span className="rounded-lg bg-teal-100 px-3 py-1.5 text-sm font-medium text-teal-800">En ruta</span>
          )}
          {route.status === 'DONE' && (
            <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800">
              Completada
            </span>
          )}
        </div>
      </div>

      <DeliveryMap stops={stops} courier={courier} />

      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
        {route.orders.map((o) => {
          const addr = o.customerAddress?.address ?? o.deliveryAddress ?? '—';
          const noCoords = o.customerAddress?.lat == null;
          return (
            <div key={o.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 text-sm last:border-0">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  o.status === 'DELIVERED' ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white'
                }`}
              >
                {o.routeSeq}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <Link href={`/pedidos/${o.id}`} className="text-blue-700 hover:underline">
                    {o.code}
                  </Link>{' '}
                  <span className="font-normal text-neutral-500">
                    {o.customer.name ?? o.customer.whatsappPhone}
                  </span>
                </p>
                <p className="truncate text-neutral-500">
                  {addr}
                  {o.deliveryZone ? ` · ${o.deliveryZone}` : ''}
                  {noCoords && <span className="ml-1 text-amber-600">(sin ubicar)</span>}
                </p>
              </div>
              {o.status === 'DELIVERED' ? (
                <span className="text-xs font-medium text-emerald-600">Entregado</span>
              ) : (
                <span className="text-xs text-neutral-400">Pendiente</span>
              )}
              {o.deliveryPhotoPath && (
                <a
                  href={`${API_ORIGIN}${o.deliveryPhotoPath}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-700 hover:underline"
                >
                  foto
                </a>
              )}
              {route.status === 'DRAFT' && o.status !== 'DELIVERED' && (
                <button
                  onClick={() => removeOrder(o.id)}
                  disabled={busy}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Sacar de la ruta (vuelve a disponibles)"
                >
                  Sacar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Añadir pedidos de último minuto — solo mientras la ruta no salió. */}
      {route.status === 'DRAFT' && available.data && available.data.length > 0 && (
        <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Añadir pedido a esta ruta</h2>
          <div className="space-y-2">
            {available.data.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-2 text-sm hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={toAdd.has(o.id)}
                  onChange={() =>
                    setToAdd((prev) => {
                      const n = new Set(prev);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    })
                  }
                />
                <span className="font-medium">{o.code}</span>
                <span className="text-neutral-500">{o.customer.name ?? o.customer.whatsappPhone}</span>
                <span className="ml-auto truncate text-neutral-500">
                  {o.customerAddress?.address ?? o.deliveryAddress ?? '—'}
                  {o.deliveryZone ? ` · ${o.deliveryZone}` : ''}
                </span>
              </label>
            ))}
          </div>
          <button
            onClick={addOrders}
            disabled={busy || toAdd.size === 0}
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy ? 'Añadiendo…' : `Añadir (${toAdd.size})`}
          </button>
        </div>
      )}
    </div>
  );
}
