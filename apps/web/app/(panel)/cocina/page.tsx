'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { OrderStatus } from '@lhdv/shared';
import { api, API_BASE, getToken } from '@/lib/api';
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
  const [bajaFor, setBajaFor] = useState<Order | null>(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [fotoBaja, setFotoBaja] = useState<File | null>(null);
  const [danados, setDanados] = useState<Record<string, number>>({});
  const faltantes = (stock.data ?? []).filter((r) => r.parStock > 0 && r.readyStock < r.parStock);

  // Baja parcial: cuántas unidades de cada producto se dañaron (se rehacen) + motivo + foto.
  async function darDeBaja() {
    if (!bajaFor || !motivoBaja.trim()) return;
    const items = Object.entries(danados)
      .filter(([, q]) => q > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.length === 0) return;
    setBusyId(bajaFor.id);
    try {
      const fd = new FormData();
      fd.append('items', JSON.stringify(items));
      fd.append('reason', motivoBaja.trim());
      if (fotoBaja) fd.append('photo', fotoBaja);
      const token = getToken();
      const res = await fetch(`${API_BASE}/orders/${bajaFor.id}/scrap-items`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? 'No se pudo dar de baja');
      }
      setBajaFor(null);
      setMotivoBaja('');
      setFotoBaja(null);
      setDanados({});
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // Producir para reponer el stock al objetivo: suma el faltante y descuenta insumos.
  async function reponer(r: StockRow) {
    const falta = r.parStock - r.readyStock;
    setReponiendo(r.id);
    try {
      // Crea un pedido de producción que entra a Cocina como un pedido más.
      await api(`/finished-stock/${r.id}/produce-order`, {
        method: 'POST',
        body: JSON.stringify({ quantity: falta }),
      });
      await stock.reload();
      await reload(); // el nuevo pedido de producción aparece en el tablero
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
    // Resaltar el pedido si trae cualquier observación (general o por producto).
    const hasObs = !!o.notes || o.items.some((it) => it.customText);
    return (
      <div
        key={o.id}
        className={`rounded-lg bg-white p-3 shadow-sm ${hasObs ? 'ring-2 ring-amber-400' : 'ring-1 ring-neutral-200'} ${later ? 'opacity-70' : ''}`}
      >
        {/* Encabezado secundario: código + fecha */}
        <div className="flex items-center justify-between text-xs text-neutral-400">
          {o.isStockProduction ? (
            <span className="font-semibold text-purple-700">🏭 Para stock</span>
          ) : (
            <Link href={`/pedidos/${o.id}`} className="font-medium text-blue-600 hover:underline">
              {o.code}
            </Link>
          )}
          {later && days != null ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
              {formatDate(o.deliveryDate)} · en {days} días
            </span>
          ) : (
            <span>{formatDate(o.deliveryDate)}</span>
          )}
        </div>

        {/* Lo que se produce: protagonista. La cantidad cubierta por stock no se hornea. */}
        <ul className="mt-2 space-y-1.5">
          {o.items.map((it) => {
            const fromStock = it.fromStockQty ?? 0;
            const produceQty = it.quantity - fromStock;
            const allStock = produceQty <= 0;
            return (
              <li key={it.id} className={`leading-tight ${allStock ? 'opacity-50' : ''}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums text-neutral-900">
                    {allStock ? it.quantity : produceQty}×
                  </span>
                  <span className="text-base font-semibold text-neutral-900">
                    {it.variant.product.name}
                    <span className="font-medium text-neutral-600"> · {it.variant.name}</span>
                    {allStock && <span className="ml-1 text-xs font-medium text-emerald-600">✓ de stock</span>}
                    {!allStock && fromStock > 0 && (
                      <span className="ml-1 text-xs font-medium text-emerald-600">({fromStock} de stock)</span>
                    )}
                  </span>
                </div>
                {it.customText && (
                  <p className="ml-8 mt-1 rounded bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-800">
                    💬 {it.customText}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {o.notes && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
            📝 Observación: {o.notes}
          </p>
        )}

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
                  onClick={() => {
                    setBajaFor(o);
                    setMotivoBaja('');
                    setFotoBaja(null);
                    setDanados({});
                  }}
                  disabled={busyId === o.id}
                  className="rounded-md border border-red-200 px-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                  title="Dar de baja: producto no apto. Pide motivo y evidencia; vuelve a Confirmado (merma)."
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
        <h1 className="text-lg font-semibold">Producción · qué se produce hoy</h1>
        {readOnly && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Solo consulta
          </span>
        )}
        {!readOnly && (
          <Link
            href="/productos-listos"
            className="ml-auto rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
          >
            📦 Productos listos
          </Link>
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
            Productos por debajo del objetivo. Tocá “Producir” para crear un pedido que pasa por las
            etapas de cocina; al marcarlo Listo se suma al stock.
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
                    {reponiendo === r.id ? '…' : `Producir ${falta}`}
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

      {/* Baja de producto: motivo (obligatorio) + foto de evidencia. */}
      {bajaFor && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBajaFor(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-red-700">Dar de baja dañados · {bajaFor.code}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Indicá cuántas unidades de cada producto se dañaron. Se rehacen (los insumos
              gastados quedan como merma) y el pedido sigue para entregar completo.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                {bajaFor.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {it.variant.product.name} · {it.variant.name}
                      <span className="text-neutral-400"> (de {it.quantity})</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={it.quantity}
                      value={danados[it.id] ?? 0}
                      onChange={(e) =>
                        setDanados((d) => ({
                          ...d,
                          [it.id]: Math.max(0, Math.min(it.quantity, Number(e.target.value) || 0)),
                        }))
                      }
                      className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-center text-sm"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">¿Qué pasó? *</label>
                <textarea
                  value={motivoBaja}
                  onChange={(e) => setMotivoBaja(e.target.value)}
                  rows={2}
                  placeholder="Se quemó, mal horneado…"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Foto de evidencia (opcional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFotoBaja(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setBajaFor(null)}
                className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={darDeBaja}
                disabled={
                  !motivoBaja.trim() ||
                  busyId === bajaFor.id ||
                  Object.values(danados).every((q) => !q)
                }
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {busyId === bajaFor.id ? 'Guardando…' : 'Dar de baja y rehacer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
