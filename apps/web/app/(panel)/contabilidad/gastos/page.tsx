'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { EXPENSE_CATEGORY_LABEL, formatDate } from '@/lib/labels';
import type { Expense, ExpenseCategory, Ingredient, SupplierLite } from '@/lib/types';

// Categorías reales de GASTO operativo (las compras de insumos van por renglones, no acá).
const GASTO_CATEGORIES = (Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).filter(
  (c) => c !== 'INGREDIENTS',
);
const today = () => new Date().toISOString().slice(0, 10);

// Presentaciones de compra según la unidad base del insumo. El factor convierte a unidad base.
const PRESETS: Record<string, { label: string; factor: number }[]> = {
  g: [
    { label: 'Gramos', factor: 1 },
    { label: 'Kilos', factor: 1000 },
    { label: 'Libras', factor: 500 },
  ],
  ml: [
    { label: 'Mililitros', factor: 1 },
    { label: 'Litros', factor: 1000 },
  ],
  unidad: [
    { label: 'Unidades', factor: 1 },
    { label: 'Docenas', factor: 12 },
  ],
};
const presetsFor = (unit: string) => PRESETS[unit] ?? [{ label: unit || 'Unidades', factor: 1 }];

interface LineDraft {
  key: number;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  presetIdx: number;
  packCount: string;
  lineCop: string;
}

let lineSeq = 1;
const emptyLine = (): LineDraft => ({
  key: lineSeq++,
  ingredientId: '',
  ingredientName: '',
  unit: '',
  presetIdx: 0,
  packCount: '',
  lineCop: '',
});

const round = (n: number) => Math.round(n * 100) / 100;

function GastosInner() {
  const params = useSearchParams();
  const { data: expenses, loading, error, reload } = useApi<Expense[]>('/expenses');
  const { data: ingredients } = useApi<Ingredient[]>('/ingredients');
  const { data: suppliers, reload: reloadSuppliers } = useApi<SupplierLite[]>('/expenses/suppliers');

  const [tipo, setTipo] = useState<'gasto' | 'compra'>('gasto');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  // Gasto
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  // Compra
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byName = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients ?? []) m.set(i.name.toLowerCase(), i);
    return m;
  }, [ingredients]);

  // Si venimos de Inventario con ?insumo=<id>, abrimos en modo compra con ese insumo cargado.
  useEffect(() => {
    const id = params.get('insumo');
    if (!id || !ingredients) return;
    const ing = ingredients.find((i) => i.id === id);
    if (!ing) return;
    setTipo('compra');
    setLines([{ ...emptyLine(), ingredientId: ing.id, ingredientName: ing.name, unit: ing.unit }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients]);

  function patchLine(key: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function onIngredientChange(key: number, name: string) {
    const ing = byName.get(name.trim().toLowerCase());
    patchLine(key, {
      ingredientName: name,
      ingredientId: ing?.id ?? '',
      unit: ing?.unit ?? '',
      presetIdx: 0,
    });
  }

  const computed = lines.map((l) => {
    const preset = presetsFor(l.unit)[l.presetIdx] ?? presetsFor(l.unit)[0];
    const qtyBase = (Number(l.packCount) || 0) * preset.factor;
    const lineCop = Math.round(Number(l.lineCop) || 0);
    const valid = !!l.ingredientId && qtyBase > 0 && lineCop > 0;
    return { l, preset, qtyBase, lineCop, unitCost: qtyBase > 0 ? lineCop / qtyBase : 0, valid };
  });
  const compraTotal = computed.filter((c) => c.valid).reduce((s, c) => s + c.lineCop, 0);
  const unmatched = lines.some((l) => l.ingredientName.trim() && !l.ingredientId);

  function resetForm() {
    setNotes('');
    setDescription('');
    setAmount(0);
    setSupplierName('');
    setInvoiceNo('');
    setLines([emptyLine()]);
  }

  async function submit() {
    setFormError(null);
    setBusy(true);
    try {
      if (tipo === 'compra') {
        const valid = computed.filter((c) => c.valid);
        if (valid.length === 0) throw new Error('Agregá al menos un insumo con cantidad y precio.');
        await api('/expenses', {
          method: 'POST',
          body: JSON.stringify({
            date,
            category: 'INGREDIENTS',
            supplierName: supplierName.trim() || undefined,
            invoiceNo: invoiceNo.trim() || undefined,
            notes: notes.trim() || undefined,
            lines: valid.map((c) => ({
              ingredientId: c.l.ingredientId,
              packLabel: `${c.l.packCount} ${c.preset.label}`,
              qtyBase: c.qtyBase,
              lineCop: c.lineCop,
            })),
          }),
        });
        await Promise.all([reload(), reloadSuppliers()]);
      } else {
        if (!description.trim() || !amount) throw new Error('Poné descripción y monto.');
        await api('/expenses', {
          method: 'POST',
          body: JSON.stringify({
            date,
            category,
            description: description.trim(),
            amountCop: amount,
            supplierName: supplierName.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
        });
        await Promise.all([reload(), reloadSuppliers()]);
      }
      resetForm();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Expense) {
    const isCompra = (e.lines?.length ?? 0) > 0;
    const msg = isCompra
      ? '¿Anular esta compra? Se va a descontar del inventario lo que había entrado.'
      : '¿Eliminar este gasto?';
    if (!confirm(msg)) return;
    await api(`/expenses/${e.id}`, { method: 'DELETE' });
    await reload();
  }

  const total = expenses?.reduce((s, e) => s + e.amountCop, 0) ?? 0;
  const field =
    'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`;

  return (
    <div>
      <div className="mb-5 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        {/* Selector tipo */}
        <div className="mb-4 flex items-center gap-1">
          <button onClick={() => setTipo('gasto')} className={tab(tipo === 'gasto')}>
            💸 Gasto
          </button>
          <button onClick={() => setTipo('compra')} className={tab(tipo === 'compra')}>
            📦 Compra de insumos
          </button>
          <span className="ml-3 text-xs text-neutral-400">
            {tipo === 'compra'
              ? 'Mueve el inventario y actualiza los costos.'
              : 'Plata que sale (arriendo, nómina, domicilios…). No toca inventario.'}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-500">
            Fecha
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`mt-1 block ${field}`}
            />
          </label>

          {tipo === 'gasto' ? (
            <>
              <label className="text-xs text-neutral-500">
                Categoría
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className={`mt-1 block ${field}`}
                >
                  {GASTO_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-xs text-neutral-500">
                Descripción
                <input
                  placeholder="Ej. Arriendo junio, pago domiciliario Juan…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`mt-1 block w-full ${field}`}
                />
              </label>
              <label className="text-xs text-neutral-500">
                Proveedor / a quién (opcional)
                <input
                  list="suppliers"
                  placeholder="Opcional"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className={`mt-1 block w-48 ${field}`}
                />
              </label>
              <label className="text-xs text-neutral-500">
                Monto
                <input
                  type="number"
                  placeholder="0"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className={`mt-1 block w-36 ${field}`}
                />
              </label>
            </>
          ) : (
            <>
              <label className="text-xs text-neutral-500">
                Proveedor (opcional)
                <input
                  list="suppliers"
                  placeholder="Sin factura está bien"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className={`mt-1 block w-52 ${field}`}
                />
              </label>
              <label className="text-xs text-neutral-500">
                N° factura (opcional)
                <input
                  placeholder="—"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className={`mt-1 block w-32 ${field}`}
                />
              </label>
            </>
          )}
        </div>

        <datalist id="suppliers">
          {(suppliers ?? []).map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>

        {/* Renglones de insumos (solo compra) */}
        {tipo === 'compra' && (
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-[1fr_8rem_5rem_7rem_auto] gap-2 px-1 text-[11px] uppercase tracking-wide text-neutral-400">
              <span>Insumo</span>
              <span>Presentación</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">Precio total</span>
              <span></span>
            </div>
            {lines.map((l) => {
              const c = computed.find((x) => x.l.key === l.key)!;
              const presets = presetsFor(l.unit);
              return (
                <div key={l.key} className="space-y-0.5">
                  <div className="grid grid-cols-[1fr_8rem_5rem_7rem_auto] items-center gap-2">
                    <input
                      list="ingredients"
                      placeholder="Buscar insumo…"
                      value={l.ingredientName}
                      onChange={(e) => onIngredientChange(l.key, e.target.value)}
                      className={`${field} ${l.ingredientName.trim() && !l.ingredientId ? 'border-red-400' : ''}`}
                    />
                    <select
                      value={l.presetIdx}
                      onChange={(e) => patchLine(l.key, { presetIdx: Number(e.target.value) })}
                      className={field}
                      disabled={!l.ingredientId}
                    >
                      {presets.map((p, idx) => (
                        <option key={p.label} value={idx}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="0"
                      value={l.packCount}
                      onChange={(e) => patchLine(l.key, { packCount: e.target.value })}
                      className={`${field} text-right`}
                    />
                    <input
                      type="number"
                      placeholder="0"
                      value={l.lineCop}
                      onChange={(e) => patchLine(l.key, { lineCop: e.target.value })}
                      className={`${field} text-right`}
                    />
                    <button
                      onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                      className="px-2 text-neutral-400 hover:text-red-600"
                      title="Quitar renglón"
                    >
                      ✕
                    </button>
                  </div>
                  {c.qtyBase > 0 && l.ingredientId && (
                    <p className="px-1 text-xs text-neutral-500">
                      = {round(c.qtyBase)} {l.unit} · {formatCop(Math.round(c.unitCost))}/{l.unit}
                    </p>
                  )}
                </div>
              );
            })}
            <datalist id="ingredients">
              {(ingredients ?? []).map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
            <button
              onClick={() => setLines((ls) => [...ls, emptyLine()])}
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              + Agregar insumo
            </button>
          </div>
        )}

        {/* Notas + acción */}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs text-neutral-500">
            Notas (opcional)
            <input
              placeholder="Observación"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          {tipo === 'compra' && (
            <div className="text-right text-sm">
              <p className="text-xs text-neutral-500">Total compra</p>
              <p className="text-lg font-semibold">{formatCop(compraTotal)}</p>
            </div>
          )}
          <button
            onClick={submit}
            disabled={busy || (tipo === 'compra' ? compraTotal === 0 : !description.trim() || !amount)}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {tipo === 'compra' ? 'Guardar compra' : 'Registrar gasto'}
          </button>
        </div>
        {unmatched && tipo === 'compra' && (
          <p className="mt-2 text-xs text-amber-700">
            ⚠ Hay un insumo escrito que no existe en el catálogo. Elegilo de la lista o cargalo primero en
            Inventario.
          </p>
        )}
        {formError && <p className="mt-2 text-sm text-red-700">{formError}</p>}
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {expenses && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {expenses.map((e) => {
                const isCompra = (e.lines?.length ?? 0) > 0;
                return (
                  <tr key={e.id} className="align-top hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-600">{formatDate(e.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isCompra ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                            📦 Compra
                          </span>
                        ) : (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                            {EXPENSE_CATEGORY_LABEL[e.category]}
                          </span>
                        )}
                        <span>{e.description}</span>
                        {e.invoiceNo && <span className="text-xs text-neutral-400">#{e.invoiceNo}</span>}
                      </div>
                      {isCompra && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {e.lines!
                            .map((ln) => `${ln.ingredient?.name ?? 'insumo'} (${round(ln.qtyBase)} ${ln.ingredient?.unit ?? ''})`)
                            .join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{e.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCop(e.amountCop)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove(e)} className="text-neutral-400 hover:text-red-600">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Sin gastos ni compras registradas
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={3}>
                    Total (gastos + compras)
                  </td>
                  <td className="px-4 py-3 text-right">{formatCop(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

export default function GastosPage() {
  return (
    <Suspense fallback={<p className="text-neutral-500">Cargando…</p>}>
      <GastosInner />
    </Suspense>
  );
}
