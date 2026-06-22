'use client';

import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDateTime } from '@/lib/labels';

interface StockRow {
  id: string;
  name: string;
  priceCop: number;
  parStock: number;
  readyStock: number;
  product: { name: string; category: string | null };
}
type FinishedMoveType = 'PRODUCTION' | 'SALE' | 'RETURN' | 'ADJUSTMENT';
interface StockMovement {
  id: string;
  type: FinishedMoveType;
  quantity: number;
  reason: string | null;
  createdAt: string;
  variant?: { name: string; product: { name: string } };
}

const MOVE_LABEL: Record<FinishedMoveType, string> = {
  PRODUCTION: 'Producción',
  SALE: 'Venta',
  RETURN: 'Devolución',
  ADJUSTMENT: 'Ajuste',
};

function estado(par: number, ready: number) {
  if (ready <= 0) return { dot: '🔴', label: 'Agotado', cls: 'text-red-600' };
  if (ready < par) return { dot: '🟡', label: 'Bajo', cls: 'text-amber-700' };
  return { dot: '🟢', label: 'OK', cls: 'text-emerald-700' };
}

export default function ProductosListosPage() {
  const { data: rows, loading, error, reload } = useApi<StockRow[]>('/finished-stock');
  const movements = useApi<StockMovement[]>('/finished-stock/movements');

  const label = (r: StockRow) => `${r.product.name} · ${r.name}`;
  async function reloadAll() {
    await reload();
    await movements.reload();
  }

  async function setPar(r: StockRow) {
    const v = prompt(`¿Cuántas "${label(r)}" querés tener SIEMPRE listas? (0 = no llevar en stock)`, String(r.parStock));
    if (v == null) return;
    await api(`/finished-stock/${r.id}/par`, { method: 'PATCH', body: JSON.stringify({ parStock: Number(v) }) });
    await reload();
  }
  async function produce(r: StockRow) {
    const v = prompt(`¿Cuántas "${label(r)}" produjiste para stock? (descuenta los insumos de la receta)`, '1');
    if (!v) return;
    await api(`/finished-stock/${r.id}/produce`, { method: 'POST', body: JSON.stringify({ quantity: Number(v) }) });
    await reloadAll();
  }
  async function adjust(r: StockRow) {
    const v = prompt(`Conteo real de "${label(r)}" listas ahora:`, String(r.readyStock));
    if (v == null) return;
    await api(`/finished-stock/${r.id}/adjust`, { method: 'POST', body: JSON.stringify({ quantity: Number(v) }) });
    await reloadAll();
  }

  const enStock = (rows ?? []).filter((r) => r.parStock > 0);
  const resto = (rows ?? []).filter((r) => r.parStock === 0);
  const bajos = enStock.filter((r) => r.readyStock < r.parStock).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Productos listos</h1>
        <p className="text-sm text-neutral-500">
          Stock de productos hechos por adelantado. Cuando un pedido los pide, salen de acá y no pasan por cocina.
          Definí cuántos querés tener siempre listos (objetivo) y registrá lo que produzcas.
        </p>
      </div>

      {bajos > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {bajos} producto(s) por debajo del objetivo.
        </p>
      )}

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {rows && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <h2 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700">En stock fijo</h2>
          {enStock.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">
              Todavía no hay productos en stock fijo. Agregá uno desde la lista de abajo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Objetivo</th>
                  <th className="px-4 py-3 text-right">Listos</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {enStock.map((r) => {
                  const e = estado(r.parStock, r.readyStock);
                  return (
                    <tr key={r.id} className={r.readyStock < r.parStock ? 'bg-amber-50/60' : ''}>
                      <td className="px-4 py-2 font-medium">{label(r)}</td>
                      <td className="px-4 py-2 text-center" title={e.label}>
                        {e.dot}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => setPar(r)} className="hover:underline" title="Editar objetivo">
                          {r.parStock}
                        </button>
                      </td>
                      <td className={`px-4 py-2 text-right text-base font-semibold ${e.cls}`}>{r.readyStock}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => produce(r)}
                          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                        >
                          Produje
                        </button>
                        <button
                          onClick={() => adjust(r)}
                          className="ml-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {rows && resto.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <h2 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700">
            Agregar al stock
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {resto.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">{label(r)}</td>
                  <td className="px-4 py-2 text-right text-neutral-500">{formatCop(r.priceCop)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setPar(r)}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100"
                    >
                      + Poner en stock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Movimientos recientes</h2>
        {movements.data && (
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2 text-right">Cantidad</th>
                  <th className="px-4 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {movements.data.slice(0, 50).map((m) => {
                  const entra = m.type === 'PRODUCTION' || m.type === 'RETURN';
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2 text-neutral-500">{formatDateTime(m.createdAt)}</td>
                      <td className="px-4 py-2">
                        {m.variant ? `${m.variant.product.name} · ${m.variant.name}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{MOVE_LABEL[m.type]}</td>
                      <td
                        className={`px-4 py-2 text-right ${entra ? 'text-emerald-700' : m.type === 'SALE' ? 'text-red-600' : 'text-neutral-600'}`}
                      >
                        {entra ? '+' : m.type === 'SALE' ? '−' : '±'}
                        {m.quantity}
                      </td>
                      <td className="px-4 py-2 text-neutral-500">{m.reason ?? '—'}</td>
                    </tr>
                  );
                })}
                {movements.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                      Sin movimientos todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
