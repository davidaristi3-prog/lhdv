'use client';

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useApi } from '@/lib/use-api';
import { STATUS_LABEL } from '@/lib/labels';
import type { OrderStatus } from '@lhdv/shared';

const LiveMap = dynamic(() => import('@/app/components/LiveMap').then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="h-[440px] w-full animate-pulse rounded-xl bg-neutral-100" />,
});

// Un color por domiciliario en el mapa y las tarjetas.
const COLORS = ['#2563eb', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#db2777'];

interface LiveOrder {
  id: string;
  code: string | null;
  routeSeq: number | null;
  status: OrderStatus;
  customer: { name: string | null } | null;
  customerAddress: { lat: number | null; lng: number | null; address: string } | null;
  deliveryAddress: string | null;
}
interface LiveRouteData {
  id: string;
  courierLat: number | null;
  courierLng: number | null;
  courierAt: string | null;
  courier: { id: string; name: string } | null;
  orders: LiveOrder[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'sin reportar';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'hace instantes';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.round(mins / 60)} h`;
}

const isDone = (s: OrderStatus) => s === 'DELIVERED';
const isReturned = (s: OrderStatus) => s === 'CANCELLED';

export default function SeguimientoPage() {
  const { data, loading, reload } = useApi<LiveRouteData[]>('/routes/live');

  // Refresco en vivo cada 15 segundos.
  useEffect(() => {
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  const routes = data ?? [];

  const mapRoutes = useMemo(
    () =>
      routes.map((r, i) => ({
        id: r.id,
        courierName: r.courier?.name ?? 'Sin asignar',
        color: COLORS[i % COLORS.length],
        courier:
          r.courierLat != null && r.courierLng != null
            ? { lat: r.courierLat, lng: r.courierLng }
            : null,
        stops: r.orders
          .filter((o) => o.customerAddress?.lat != null && o.customerAddress?.lng != null)
          .map((o) => ({
            lat: o.customerAddress!.lat as number,
            lng: o.customerAddress!.lng as number,
            label: o.customer?.name ?? o.code ?? 'Pedido',
            seq: o.routeSeq ?? 0,
            done: isDone(o.status),
          })),
      })),
    [routes],
  );

  const totalStops = routes.reduce((n, r) => n + r.orders.length, 0);
  const totalDone = routes.reduce((n, r) => n + r.orders.filter((o) => isDone(o.status)).length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Seguimiento de rutas</h1>
        <span className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          en vivo · se actualiza cada 15s
        </span>
      </div>

      {loading && !data && <p className="text-neutral-500">Cargando…</p>}

      {data && routes.length === 0 && (
        <p className="rounded-xl bg-white p-10 text-center text-neutral-400 ring-1 ring-neutral-200">
          No hay domiciliarios en ruta en este momento.
        </p>
      )}

      {routes.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat label="En ruta" value={`${routes.length}`} hint="domiciliarios" />
            <Stat label="Entregas" value={`${totalDone} / ${totalStops}`} hint="completadas" />
          </div>

          <LiveMap routes={mapRoutes} height={440} />

          <div className="grid gap-4 md:grid-cols-2">
            {routes.map((r, i) => (
              <RouteCard key={r.id} route={r} color={COLORS[i % COLORS.length]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-neutral-200">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-neutral-400">{hint}</p>
    </div>
  );
}

function RouteCard({ route, color }: { route: LiveRouteData; color: string }) {
  const total = route.orders.length;
  const done = route.orders.filter((o) => isDone(o.status)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
          <span className="font-semibold">{route.courier?.name ?? 'Sin asignar'}</span>
        </div>
        <span className="text-sm text-neutral-500">
          {done} de {total} entregadas
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      <p className="mt-2 text-xs text-neutral-400">📍 Ubicación {timeAgo(route.courierAt)}</p>

      <ul className="mt-3 space-y-1.5">
        {route.orders.map((o) => {
          const ok = isDone(o.status);
          const back = isReturned(o.status);
          return (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  ok
                    ? 'bg-emerald-500 text-white'
                    : back
                      ? 'bg-neutral-300 text-neutral-600'
                      : 'text-white'
                }`}
                style={!ok && !back ? { background: color } : undefined}
              >
                {ok ? '✓' : back ? '↩' : o.routeSeq}
              </span>
              <span className={ok || back ? 'text-neutral-400' : ''}>
                <span className={ok ? 'line-through' : ''}>
                  {o.customer?.name ?? o.code ?? 'Pedido'}
                </span>
                <span className="text-neutral-400">
                  {' · '}
                  {o.customerAddress?.address ?? o.deliveryAddress ?? 'sin dirección'}
                </span>
                {(ok || back) && <span className="ml-1 text-xs">({STATUS_LABEL[o.status]})</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
