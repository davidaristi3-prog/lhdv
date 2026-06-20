'use client';

import { useEffect, useRef, useState } from 'react';
import { api, API_BASE, getToken } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import type { DeliveryRoute, Order } from '@/lib/types';

export default function MiRutaPage() {
  const { data: route, loading, error, reload } = useApi<DeliveryRoute>('/routes/mine');
  const [busyId, setBusyId] = useState<string | null>(null);
  const lastPost = useRef(0);

  // Reporte de ubicación en vivo mientras la ruta está en curso.
  useEffect(() => {
    if (!route || route.status !== 'IN_PROGRESS' || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPost.current < 10000) return; // máx. 1 reporte / 10s
        lastPost.current = now;
        void api(`/routes/${route.id}/location`, {
          method: 'POST',
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [route?.id, route?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (!route) return;
    setBusyId('start');
    try {
      await api(`/routes/${route.id}/start`, { method: 'POST' });
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function deliver(order: Order, file?: File) {
    setBusyId(order.id);
    try {
      const fd = new FormData();
      if (file) fd.append('photo', file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/routes/orders/${order.id}/deliver-photo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? 'No se pudo marcar entregado');
      }
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!route) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-neutral-500 ring-1 ring-neutral-200">
        No tenés una ruta asignada por ahora.
      </div>
    );
  }

  const pending = route.orders.filter((o) => o.status !== 'DELIVERED').length;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Mi ruta</h1>
        <span className="text-sm text-neutral-500">{pending} pendientes</span>
      </div>

      {route.status === 'DRAFT' && (
        <button
          onClick={start}
          disabled={busyId === 'start'}
          className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busyId === 'start' ? 'Iniciando…' : 'Iniciar ruta'}
        </button>
      )}

      <div className="space-y-3">
        {route.orders.map((o) => {
          const done = o.status === 'DELIVERED';
          const addr = o.customerAddress?.address ?? o.deliveryAddress ?? '';
          const phone = o.customer.whatsappPhone;
          const wa = phone.replace(/[^0-9]/g, '');
          const navHref =
            o.customerAddress?.lat != null && o.customerAddress?.lng != null
              ? `https://www.google.com/maps/dir/?api=1&destination=${o.customerAddress.lat},${o.customerAddress.lng}`
              : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
          return (
            <div
              key={o.id}
              className={`rounded-xl bg-white p-4 ring-1 ring-neutral-200 ${done ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    done ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white'
                  }`}
                >
                  {o.routeSeq}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.customer.name ?? phone}</p>
                  <p className="text-sm text-neutral-500">{addr}</p>
                  {o.deliveryZone && <p className="text-xs text-neutral-400">{o.deliveryZone}</p>}
                </div>
                {done && <span className="text-xs font-medium text-emerald-600">Entregado</span>}
              </div>

              {!done && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <a
                    href={navHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-neutral-300 py-2 text-center font-medium hover:bg-neutral-50"
                  >
                    Navegar
                  </a>
                  <a
                    href={`tel:${phone}`}
                    className="rounded-lg border border-neutral-300 py-2 text-center font-medium hover:bg-neutral-50"
                  >
                    Llamar
                  </a>
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-neutral-300 py-2 text-center font-medium hover:bg-neutral-50"
                  >
                    WhatsApp
                  </a>
                  <label className="col-span-2 cursor-pointer rounded-lg bg-neutral-900 py-2 text-center font-medium text-white hover:bg-neutral-800">
                    {busyId === o.id ? 'Subiendo…' : '📷 Entregar con foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={busyId === o.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void deliver(o, f);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => deliver(o)}
                    disabled={busyId === o.id}
                    className="rounded-lg border border-neutral-300 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Sin foto
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
