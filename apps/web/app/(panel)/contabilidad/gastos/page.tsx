'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { EXPENSE_CATEGORY_LABEL, formatDate } from '@/lib/labels';
import type { Expense, ExpenseCategory } from '@/lib/types';

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
const today = () => new Date().toISOString().slice(0, 10);

export default function GastosPage() {
  const { data: expenses, loading, error, reload } = useApi<Expense[]>('/expenses');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory>('INGREDIENTS');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setFormError(null);
    setBusy(true);
    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ date, category, description, amountCop: amount }),
      });
      setDescription('');
      setAmount(0);
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await api(`/expenses/${id}`, { method: 'DELETE' });
    await reload();
  }

  const total = expenses?.reduce((s, e) => s + e.amountCop, 0) ?? 0;
  const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={field}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EXPENSE_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <input
          placeholder="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`flex-1 ${field}`}
        />
        <input
          type="number"
          placeholder="Monto"
          value={amount || ''}
          onChange={(e) => setAmount(Number(e.target.value))}
          className={`w-36 ${field}`}
        />
        <button
          onClick={create}
          disabled={busy || !description || !amount}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          Registrar gasto
        </button>
        {formError && <span className="w-full text-sm text-red-700">{formError}</span>}
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {expenses && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-600">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                  <td className="px-4 py-3">{e.description}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCop(e.amountCop)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e.id)} className="text-neutral-400 hover:text-red-600">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Sin gastos registrados
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={3}>
                    Total
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
