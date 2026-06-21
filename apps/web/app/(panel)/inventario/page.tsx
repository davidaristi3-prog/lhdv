'use client';

import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDateTime } from '@/lib/labels';
import type { Ingredient, InventoryMovement, InventoryMoveType } from '@/lib/types';

const round = (n: number) => Math.round(n * 100) / 100;
const MOVE_LABEL: Record<InventoryMoveType, string> = {
  PURCHASE: 'Compra',
  CONSUMPTION: 'Consumo',
  ADJUSTMENT: 'Ajuste',
};

export default function InventarioPage() {
  const { data: ingredients, loading, error, reload } = useApi<Ingredient[]>('/ingredients?all=true');
  const movements = useApi<InventoryMovement[]>('/ingredients/movements');

  async function purchase(i: Ingredient) {
    const v = prompt(`¿Cuánto entra de ${i.name}? (en ${i.unit})`);
    if (!v) return;
    await api(`/ingredients/${i.id}/purchase`, { method: 'POST', body: JSON.stringify({ quantity: Number(v) }) });
    await reload();
    await movements.reload();
  }
  async function adjust(i: Ingredient) {
    const v = prompt(`Stock real de ${i.name} (en ${i.unit}):`, String(round(i.stockQty)));
    if (v == null) return;
    await api(`/ingredients/${i.id}/adjust`, { method: 'POST', body: JSON.stringify({ quantity: Number(v) }) });
    await reload();
    await movements.reload();
  }
  async function setMin(i: Ingredient) {
    const v = prompt(`Alerta de stock bajo de ${i.name} (en ${i.unit}; vacío = sin alerta):`, i.lowStockQty?.toString() ?? '');
    if (v == null) return;
    await api(`/ingredients/${i.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ lowStockQty: v === '' ? null : Number(v) }),
    });
    await reload();
  }

  const totalValue = (ingredients ?? []).reduce((s, i) => s + i.stockQty * i.costPerUnitCop, 0);
  const lowCount = (ingredients ?? []).filter((i) => i.lowStockQty != null && i.stockQty <= i.lowStockQty).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Inventario de materias primas</h1>
          <p className="text-sm text-neutral-500">
            El stock baja solo cuando un pedido entra a producción, según la receta de cada producto. Registrá tus
            compras y ajustes acá.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-500">Valor del inventario</p>
          <p className="text-xl font-semibold">{formatCop(Math.round(totalValue))}</p>
        </div>
      </div>

      {lowCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {lowCount} insumo(s) con stock bajo.
        </p>
      )}

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {ingredients && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Costo/u</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {ingredients.map((i) => {
                const low = i.lowStockQty != null && i.stockQty <= i.lowStockQty;
                return (
                  <tr key={i.id} className={low ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-2 font-medium">{i.name}</td>
                    <td
                      className={`px-4 py-2 text-right ${i.stockQty < 0 ? 'text-red-600' : low ? 'text-amber-700' : ''}`}
                    >
                      {round(i.stockQty)} {i.unit}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-500">
                      <button onClick={() => setMin(i)} className="hover:underline" title="Definir alerta de stock bajo">
                        {i.lowStockQty != null ? round(i.lowStockQty) : '—'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-500">{formatCop(Math.round(i.costPerUnitCop))}</td>
                    <td className="px-4 py-2 text-right">{formatCop(Math.round(i.stockQty * i.costPerUnitCop))}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => purchase(i)}
                        className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                      >
                        Comprar
                      </button>
                      <button
                        onClick={() => adjust(i)}
                        className="ml-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100"
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {ingredients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    No hay insumos. Cargá el costeo de los productos primero.
                  </td>
                </tr>
              )}
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
                  <th className="px-4 py-2">Insumo</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2 text-right">Cantidad</th>
                  <th className="px-4 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {movements.data.slice(0, 50).map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-neutral-500">{formatDateTime(m.createdAt)}</td>
                    <td className="px-4 py-2">{m.ingredient?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-neutral-600">{MOVE_LABEL[m.type]}</td>
                    <td
                      className={`px-4 py-2 text-right ${m.type === 'PURCHASE' ? 'text-emerald-700' : m.type === 'CONSUMPTION' ? 'text-red-600' : 'text-neutral-600'}`}
                    >
                      {m.type === 'PURCHASE' ? '+' : m.type === 'CONSUMPTION' ? '−' : '±'}
                      {round(m.quantity)} {m.ingredient?.unit ?? ''}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{m.reason ?? '—'}</td>
                  </tr>
                ))}
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
