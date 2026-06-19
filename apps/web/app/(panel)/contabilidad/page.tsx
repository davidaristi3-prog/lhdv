'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { useApi } from '@/lib/use-api';
import { EXPENSE_CATEGORY_LABEL, MONTHS } from '@/lib/labels';
import type {
  ExpenseByCategory,
  MonthSales,
  Summary,
  TopCustomer,
  TopProduct,
} from '@/lib/types';

export default function ResumenPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = from || to ? '?' + [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join('&') : '';
  const year = new Date().getFullYear();

  const summary = useApi<Summary>(`/reports/summary${qs}`);
  const topProducts = useApi<TopProduct[]>(`/reports/top-products${qs}`);
  const topCustomers = useApi<TopCustomer[]>(`/reports/top-customers${qs}`);
  const byCategory = useApi<ExpenseByCategory[]>(`/reports/expenses-by-category${qs}`);
  const byMonth = useApi<MonthSales[]>(`/reports/sales-by-month?year=${year}`);

  const s = summary.data;
  const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
  const card = 'rounded-xl bg-white p-5 ring-1 ring-neutral-200';
  const maxMonth = Math.max(1, ...(byMonth.data?.map((m) => m.ingresosCop) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-semibold">Rentabilidad</h1>
        <label className="text-sm text-neutral-500">
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`ml-2 ${field}`} />
        </label>
        <label className="text-sm text-neutral-500">
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`ml-2 ${field}`} />
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Ingresos" value={formatCop(s?.ingresosCop ?? 0)} strong />
        <Kpi
          label="Utilidad neta"
          value={formatCop(s?.utilidadNetaCop ?? 0)}
          tone={(s?.utilidadNetaCop ?? 0) >= 0 ? 'pos' : 'neg'}
          strong
        />
        <Kpi label="Margen bruto" value={`${s?.margenBrutoPct ?? 0}%`} />
        <Kpi label="Ventas" value={String(s?.ventas ?? 0)} />
        <Kpi label="COGS (insumos)" value={formatCop(s?.cogsCop ?? 0)} />
        <Kpi label="Gastos" value={formatCop(s?.gastosCop ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top productos */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Productos top</h2>
          <Table
            rows={topProducts.data ?? []}
            empty="Sin ventas en el período"
            cols={[
              { h: 'Producto', cell: (r) => r.name },
              { h: 'Cant.', cell: (r) => String(r.cantidad), right: true },
              { h: 'Ingresos', cell: (r) => formatCop(r.ingresosCop), right: true },
            ]}
          />
        </div>

        {/* Top clientes */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Clientes top</h2>
          <Table
            rows={topCustomers.data ?? []}
            empty="Sin ventas en el período"
            cols={[
              { h: 'Cliente', cell: (r) => r.name ?? r.phone },
              { h: 'Pedidos', cell: (r) => String(r.pedidos), right: true },
              { h: 'Total', cell: (r) => formatCop(r.totalCop), right: true },
            ]}
          />
        </div>

        {/* Gastos por categoría */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Gastos por categoría</h2>
          <Table
            rows={byCategory.data ?? []}
            empty="Sin gastos en el período"
            cols={[
              { h: 'Categoría', cell: (r) => EXPENSE_CATEGORY_LABEL[r.category] },
              { h: 'Total', cell: (r) => formatCop(r.totalCop), right: true },
            ]}
          />
        </div>

        {/* Ventas por mes */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Ventas por mes · {year}</h2>
          <div className="space-y-1.5">
            {byMonth.data?.map((m) => (
              <div key={m.mes} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-neutral-500">{MONTHS[m.mes - 1]}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
                  <div
                    className="h-full rounded bg-neutral-800"
                    style={{ width: `${(m.ingresosCop / maxMonth) * 100}%` }}
                  />
                </div>
                <span className="w-20 text-right text-neutral-600">{formatCop(m.ingresosCop)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'pos' | 'neg';
}) {
  const color = tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-emerald-600' : 'text-neutral-900';
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`${strong ? 'text-xl' : 'text-lg'} font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Table<T>({
  rows,
  cols,
  empty,
}: {
  rows: T[];
  cols: { h: string; cell: (r: T) => string; right?: boolean }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-neutral-400">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
        <tr>
          {cols.map((c) => (
            <th key={c.h} className={`pb-2 ${c.right ? 'text-right' : ''}`}>
              {c.h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c.h} className={`py-2 ${c.right ? 'text-right' : ''}`}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
