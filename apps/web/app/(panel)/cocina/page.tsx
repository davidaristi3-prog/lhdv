'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { OrderStatus } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth';
import { STATUS_LABEL, formatDate } from '@/lib/labels';
import type { Order } from '@/lib/types';

const COLUMNS: OrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION', 'READY'];

interface StockRow {
  id: string;
  name: string;
  parStock: number;
  readyStock: number;
  product: { name: string };
}

// Cocina solo produce: termina en "Listo". La entrega (recoger en local o domicilio)
// se maneja aparte (recoger: botón en Pedidos; domicilio: módulo Domicilios).
const FORWARD: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  CONFIRMED: { to: 'IN_PRODUCTION', label: 'Iniciar' },
  IN_PRODUCTION: { to: 'READY', label: 'Marcar listo' },
};

/** Días que faltan para la entrega: 0 = hoy, 1 = mañana, >1 = más adelante. null si no hay fecha. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

// "Para más adelante" = falta más de 1 día (pasado mañana en adelante). Sin fecha o
// vencidos quedan arriba (hay que atenderlos pronto).
const isLater = (o: Order) => {
  const n = daysUntil(o.deliveryDate);
  return n != null && n > 1;
};

export default function CocinaPage() {
  const { data: orders, loading, error, reload } = useApi<Order[]>('/orders/board');
  const { user } = useAuth();
  const readOnly = user?.role === 'SALES';
  const [busyId, setBusyId] = useState<string | null>(null);
  const stock = useApi<StockRow[]>('/finished-stock');
  const [reponiendo, setReponiendo] = useState<string | null>(null);
  const faltantes = (stock.data ?? []).filter((r) => r.parStock > 0 && r.readyStock < r.parStock);

  // Producir para reponer el stock al objetivo: suma el faltante y descuenta insumos.
  async function reponer(r: StockRow) {
    const falta = r.parStock - r.readyStock;
    setReponiendo(r.id);
    try {
      await api(`/finished-stock/${r.id}/produce`, {
        method: 'POST',
        body: JSON.stringify({ quantity: falta }),
      });
      await stock.reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setReponiendo(null);
    }
  }

  async function move(orderId: string, to: OrderStatus, scrap?: boolean) {
    setBusyId(orderId);
    try {
      await api(`/orders/${orderId}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ to, scrap }),
      });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function renderCard(o: Order, later: boolean) {
    const step = FORWARD[o.status];
    const days = daysUntil(o.deliveryDate);
    return (
      <div
        key={o.id}
        className={`rounded-lg bg-white p-3 shadow-sm ring-1 ring-neutral-200 ${later ? 'opacity-70' : ''}`}
      >
        {/* Encabezado secundario: código + fecha */}
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <Link href={`/pedidos/${o.id}`} className="font-medium text-blue-600 hover:underline">
            {o.code}
          </Link>
          {later && days != null ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
              {formatDate(o.deliveryDate)} · en {days} días
            </span>
          ) : (
            <span>{formatDate(o.deliveryDate)}</span>
          )}
        </div>

        {/* Lo que se produce: protagonista. Lo cubierto desde stock va atenuado (no se hornea). */}
        <ul className="mt-2 space-y-1.5">
          {o.items.map((it) => (
            <li
              key={it.id}
              className={`flex items-baseline gap-2 leading-tight ${it.fromStock ? 'opacity-50' : ''}`}
            >
              <span className="text-xl font-bold tabular-nums text-neutral-900">{it.quantity}×</span>
              <span className="text-base font-semibold text-neutral-900">
                {it.variant.product.name}
                <span className="font-medium text-neutral-600"> · {it.variant.name}</span>
                {it.fromStock && (
                  <span className="ml-1 text-xs font-medium text-emerald-600">✓ de stock</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* Cliente: secundario */}
        <p className="mt-2 text-xs text-neutral-400">{o.customer.name ?? o.customer.whatsappPhone}</p>
        {o.status === 'READY' && (
          <p className="mt-2 text-xs font-medium text-neutral-500">
            {o.deliveryType === 'PICKUP' ? '📦 Recoge en el local' : '🛵 Pasa a Domicilios'}
          </p>
        )}
        {!readOnly && (step || o.status === 'IN_PRODUCTION') && (
          <div className="mt-2 flex items-stretch gap-1.5">
            {step && (
              <button
                onClick={() => move(o.id, step.to)}
                disabled={busyId === o.id}
                className="flex-1 rounded-md bg-neutral-900 px-2 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {step.label} →
              </button>
            )}
            {o.status === 'IN_PRODUCTION' && (
              <>
                <button
                  onClick={() => move(o.id, 'CONFIRMED')}
                  disabled={busyId === o.id}
                  className="rounded-md border border-neutral-300 px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                  title="Devolver a Confirmado: repone los insumos (si te equivocaste y no se horneó)"
                >
                  Devolver
                </button>
                <button
                  onClick={() => move(o.id, 'CONFIRMED', true)}
                  disabled={busyId === o.id}
                  className="rounded-md border border-red-200 px-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                  title="Dar de baja: producto no apto. Vuelve a Confirmado para rehacerlo; los insumos usados NO se reponen (merma)."
                >
                  Baja
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Cocina · qué se produce hoy</h1>
        {readOnly && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Solo consulta
          </span>
        )}
      </div>
      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Reponer stock de producto terminado (no pertenece a ningún pedido). */}
      {!readOnly && faltantes.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900">
            📦 Reponer stock
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs">{faltantes.length}</span>
          </h2>
          <p className="mb-3 text-xs text-amber-700">
            Productos por debajo del objetivo. Producilos y marcá “Hecho” para sumarlos al stock listo.
          </p>
          <div className="flex flex-wrap gap-2">
            {faltantes.map((r) => {
              const falta = r.parStock - r.readyStock;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200"
                >
                  <div>
                    <p className="font-medium text-neutral-900">
                      {r.product.name} · {r.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Hay {r.readyStock} · objetivo {r.parStock}
                    </p>
                  </div>
                  <button
                    onClick={() => reponer(r)}
                    disabled={reponiendo === r.id}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {reponiendo === r.id ? '…' : `Hecho +${falta}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {orders && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const cards = orders.filter((o) => o.status === col);
            const soon = cards.filter((o) => !isLater(o));
            const later = cards.filter(isLater);
            return (
              <div key={col} className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-neutral-700">{STATUS_LABEL[col]}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-neutral-500 ring-1 ring-neutral-200">
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {soon.map((o) => renderCard(o, false))}
                  {later.length > 0 && (
                    <div className="flex items-center gap-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      <span className="h-px flex-1 bg-neutral-200" />
                      Para más adelante
                      <span className="h-px flex-1 bg-neutral-200" />
                    </div>
                  )}
                  {later.map((o) => renderCard(o, true))}
                  {cards.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-neutral-400">Sin pedidos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
