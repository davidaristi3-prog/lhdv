'use client';

import { useEffect, useRef, useState } from 'react';
import { api, API_BASE, getToken } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/labels';
import type { DeliveryRoute, Order } from '@/lib/types';

export default function MiRutaPage() {
  const { data: routes, loading, error, reload } = useApi<DeliveryRoute[]>('/routes/mine');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const lastPost = useRef(0);

  const activa = (routes ?? []).find((r) => r.status === 'IN_PROGRESS') ?? null;
  const porEmpezar = (routes ?? []).filter((r) => r.status === 'DRAFT');

  // Reporte de ubicación en vivo mientras hay una ruta en curso.
  useEffect(() => {
    if (!activa || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPost.current < 10000) return;
        lastPost.current = now;
        void api(`/routes/${activa.id}/location`, {
          method: 'POST',
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [activa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(routeId: string) {
    setBusyId('start-' + routeId);
    try {
      await api(`/routes/${routeId}/start`, { method: 'POST' });
      await reload();
    } catch (e) {
      alert((e as Error).message);
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

  async function noEntregado(order: Order, mode: 'stock' | 'reschedule') {
    setBusyId(order.id);
    try {
      await api(`/routes/orders/${order.id}/return`, { method: 'POST', body: JSON.stringify({ mode }) });
      setReturnFor(null);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!routes || routes.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 text-center text-neutral-500 ring-1 ring-neutral-200">
        No tenés rutas asignadas por ahora.
      </div>
    );
  }

  // Sin ruta en curso: elegir cuál empezar.
  if (!activa) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-lg font-semibold">Mis rutas</h1>
        <p className="text-sm text-neutral-500">
          Tenés {porEmpezar.length} ruta(s) asignada(s). Elegí cuál empezar.
        </p>
        <div className="space-y-3">
          {porEmpezar.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-neutral-200">
              <div>
                <p className="font-medium">{formatDate(r.date)}</p>
                <p className="text-sm text-neutral-500">{r.orders.length} paradas</p>
              </div>
              <button
                onClick={() => start(r.id)}
                disabled={busyId === 'start-' + r.id}
                className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {busyId === 'start-' + r.id ? 'Iniciando…' : 'Empezar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Ruta en curso: las paradas.
  const route = activa;
  const pending = route.orders.filter((o) => o.status !== 'DELIVERED').length;
  const actionBtn =
    'rounded-lg border border-neutral-300 py-2 text-center text-sm font-medium hover:bg-neutral-50';

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Mi ruta · {formatDate(route.date)}</h1>
        <span className="text-sm text-neutral-500">{pending} pendientes</span>
      </div>
      {porEmpezar.length > 0 && (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
          Tenés {porEmpezar.length} ruta(s) más en espera. Terminá esta para empezar otra.
        </p>
      )}

      <div className="space-y-3">
        {route.orders.map((o) => {
          const done = o.status === 'DELIVERED';
          const addr = o.customerAddress?.address ?? o.deliveryAddress ?? '';
          const phone = o.customer.whatsappPhone;
          const wa = phone.replace(/[^0-9]/g, '');
          const lat = o.customerAddress?.lat;
          const lng = o.customerAddress?.lng;
          const ll = lat != null && lng != null ? `${lat},${lng}` : null;
          const mapsHref = `https://www.google.com/maps/dir/?api=1&destination=${ll ?? encodeURIComponent(addr)}`;
          const wazeHref = ll
            ? `https://waze.com/ul?ll=${ll}&navigate=yes`
            : `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;
          const geoHref = ll ? `geo:${ll}?q=${ll}` : `geo:0,0?q=${encodeURIComponent(addr)}`;
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
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <a href={mapsHref} target="_blank" rel="noreferrer" className={actionBtn}>
                      Maps
                    </a>
                    <a href={wazeHref} target="_blank" rel="noreferrer" className={actionBtn}>
                      Waze
                    </a>
                    <a href={geoHref} className={actionBtn}>
                      Otra app
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <a href={`tel:${phone}`} className={actionBtn}>
                      Llamar
                    </a>
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={actionBtn}>
                      WhatsApp
                    </a>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="col-span-2 cursor-pointer rounded-lg bg-neutral-900 py-2 text-center text-sm font-medium text-white hover:bg-neutral-800">
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
                      className={`${actionBtn} disabled:opacity-50`}
                    >
                      Sin foto
                    </button>
                  </div>

                  {/* No entregado: devolver a la planta (al stock o reprogramar) */}
                  {returnFor === o.id ? (
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-amber-50 p-2">
                      <p className="col-span-2 text-xs text-amber-800">¿Qué hago con este pedido?</p>
                      <button
                        onClick={() => noEntregado(o, 'stock')}
                        disabled={busyId === o.id}
                        className="rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        📦 Al stock
                      </button>
                      <button
                        onClick={() => noEntregado(o, 'reschedule')}
                        disabled={busyId === o.id}
                        className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        🔄 Reprogramar
                      </button>
                      <button
                        onClick={() => setReturnFor(null)}
                        className="col-span-2 text-xs text-neutral-500 hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReturnFor(o.id)}
                      className="w-full rounded-lg border border-neutral-200 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
                    >
                      No se entregó…
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
