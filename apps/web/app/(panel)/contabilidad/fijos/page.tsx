'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { EXPENSE_CATEGORY_LABEL, formatDate } from '@/lib/labels';
import type { ExpenseCategory, RecurringExpense } from '@/lib/types';

// Los gastos fijos son operativos (arriendo, nómina…), nunca compras de insumos.
const CATEGORIES = (Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).filter(
  (c) => c !== 'INGREDIENTS',
);
// Fecha local (no UTC): evita que en las noches de Colombia caiga al mes siguiente.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function FijosPage() {
  const [date, setDate] = useState(today());
  // La lista mira el MES de la fecha elegida (badge ✅ y anti-duplicado siempre coherentes).
  const { data: items, loading, error, reload } = useApi<RecurringExpense[]>(
    `/recurring-expenses?month=${date.slice(0, 7)}`,
  );
  const [causeAmounts, setCauseAmounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  // Alta de un gasto fijo nuevo.
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState<ExpenseCategory>('RENT');
  const [amount, setAmount] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [day, setDay] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const amountFor = (t: RecurringExpense) => causeAmounts[t.id] ?? t.amountCop;
  const pending = (items ?? []).filter((t) => !t.causedThisMonth);

  async function addTemplate() {
    setFormError(null);
    if (!desc.trim() || !amount) {
      setFormError('Poné concepto y monto.');
      return;
    }
    setBusy(true);
    try {
      await api('/recurring-expenses', {
        method: 'POST',
        body: JSON.stringify({
          description: desc.trim(),
          category: cat,
          amountCop: amount,
          supplierName: supplier.trim() || undefined,
          dayOfMonth: day ? Number(day) : undefined,
        }),
      });
      setDesc('');
      setAmount(0);
      setSupplier('');
      setDay('');
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patchTemplate(id: string, patch: Partial<RecurringExpense>) {
    try {
      await api(`/recurring-expenses/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      // Si cambió el monto base, soltá el override local para que el campo de causar lo tome.
      if (patch.amountCop !== undefined)
        setCauseAmounts((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function delTemplate(t: RecurringExpense) {
    if (!confirm(`¿Eliminar el gasto fijo "${t.description}"? Los gastos ya causados quedan en el historial.`))
      return;
    try {
      await api(`/recurring-expenses/${t.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function causeOne(t: RecurringExpense) {
    setBusy(true);
    try {
      await api(`/recurring-expenses/${t.id}/cause`, {
        method: 'POST',
        body: JSON.stringify({ amountCop: amountFor(t), date }),
      });
      setCauseAmounts((m) => {
        const n = { ...m };
        delete n[t.id];
        return n;
      });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function causeAll() {
    const toCause = pending.filter((t) => amountFor(t) > 0);
    if (toCause.length === 0) return;
    setBusy(true);
    try {
      await api('/recurring-expenses/cause-batch', {
        method: 'POST',
        body: JSON.stringify({ date, items: toCause.map((t) => ({ recurringId: t.id, amountCop: amountFor(t) })) }),
      });
      setCauseAmounts({});
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function undo(t: RecurringExpense) {
    if (!t.causedExpense) return;
    if (!confirm(`¿Deshacer el gasto de "${t.description}" de este mes?`)) return;
    try {
      await api(`/expenses/${t.causedExpense.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const monthLabel = new Date(`${date}T12:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
  const cellInput = 'w-full rounded-md border border-transparent px-2 py-1 text-sm outline-none hover:border-neutral-200 focus:border-neutral-900';

  return (
    <div className="space-y-5">
      {/* Causar el mes */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        <div className="mr-auto">
          <h1 className="text-base font-semibold">Causar gastos fijos</h1>
          <p className="text-sm capitalize text-neutral-500">{monthLabel}</p>
        </div>
        <label className="text-xs text-neutral-500">
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 block ${field}`} />
        </label>
        <button
          onClick={causeAll}
          disabled={busy || pending.filter((t) => amountFor(t) > 0).length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          ⚡ Causar todos los pendientes ({pending.length})
        </button>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {items && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">A quién</th>
                <th className="px-4 py-3 text-right">Monto base</th>
                <th className="px-4 py-3">Este mes ({monthLabel.split(' ')[0]})</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((t) => (
                <tr key={t.id} className="align-middle hover:bg-neutral-50/60">
                  <td className="px-3 py-2">
                    <input
                      defaultValue={t.description}
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value.trim() !== t.description &&
                        patchTemplate(t.id, { description: e.target.value.trim() })
                      }
                      className={`${cellInput} font-medium`}
                    />
                    {t.dayOfMonth != null && (
                      <span className="px-2 text-xs text-neutral-400">paga el {t.dayOfMonth}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={t.category}
                      onChange={(e) => patchTemplate(t.id, { category: e.target.value as ExpenseCategory })}
                      className={cellInput}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {EXPENSE_CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={t.supplierName ?? ''}
                      placeholder="—"
                      onBlur={(e) =>
                        e.target.value.trim() !== (t.supplierName ?? '') &&
                        patchTemplate(t.id, { supplierName: e.target.value.trim() })
                      }
                      className={cellInput}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      defaultValue={t.amountCop || ''}
                      onBlur={(e) =>
                        Number(e.target.value) !== t.amountCop &&
                        patchTemplate(t.id, { amountCop: Number(e.target.value) })
                      }
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {t.causedThisMonth && t.causedExpense ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          ✅ {formatCop(t.causedExpense.amountCop)} · {formatDate(t.causedExpense.date)}
                        </span>
                        <button onClick={() => undo(t)} className="text-xs text-neutral-400 hover:text-red-600">
                          Deshacer
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={amountFor(t) || ''}
                          onChange={(e) => setCauseAmounts((m) => ({ ...m, [t.id]: Number(e.target.value) }))}
                          className={`w-32 ${field} py-1.5`}
                        />
                        <button
                          onClick={() => causeOne(t)}
                          disabled={busy || !amountFor(t)}
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
                        >
                          Causar
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => delTemplate(t)}
                      className="text-neutral-300 hover:text-red-600"
                      title="Eliminar gasto fijo"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    Todavía no tenés gastos fijos. Agregá el arriendo, la nómina, etc. abajo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Alta de gasto fijo */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Agregar un gasto fijo</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs text-neutral-500">
            Concepto
            <input
              placeholder="Ej. Arriendo local, Nómina Camila…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-xs text-neutral-500">
            Categoría
            <select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory)} className={`mt-1 block ${field}`}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-500">
            A quién (opcional)
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Opcional" className={`mt-1 block w-44 ${field}`} />
          </label>
          <label className="text-xs text-neutral-500">
            Día de pago
            <input
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              placeholder="—"
              className={`mt-1 block w-20 ${field}`}
            />
          </label>
          <label className="text-xs text-neutral-500">
            Monto típico
            <input
              type="number"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="0"
              className={`mt-1 block w-36 ${field}`}
            />
          </label>
          <button
            onClick={addTemplate}
            disabled={busy || !desc.trim() || !amount}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
        {formError && <p className="mt-2 text-sm text-red-700">{formError}</p>}
        <p className="mt-3 text-xs text-neutral-400">
          Cada mes entrás acá y con un clic causás cada gasto (podés ajustar el monto antes, p. ej. nómina con horas
          extra). Quedan en «Gastos y compras» y cuentan en la utilidad.
        </p>
      </div>
    </div>
  );
}
