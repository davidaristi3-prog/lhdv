'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import {
  SETTLEMENT_PERIOD_LABEL,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_STYLE,
  formatDate,
} from '@/lib/labels';
import type { Courier, CourierSettlement, SettlementPeriod, SettlementPreview } from '@/lib/types';

const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';
const PERIODS: SettlementPeriod[] = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
function periodRange(period: SettlementPeriod): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (period === 'WEEKLY') from.setDate(from.getDate() - 6);
  else if (period === 'BIWEEKLY') from.setDate(from.getDate() - 14);
  else if (period === 'MONTHLY') from.setDate(1);
  return { from: iso(from), to: iso(to) };
}

export default function LiquidacionesPage() {
  const { data: couriers } = useApi<Courier[]>('/couriers');
  const history = useApi<CourierSettlement[]>('/settlements');

  const [courierId, setCourierId] = useState('');
  const [period, setPeriod] = useState<SettlementPeriod>('WEEKLY');
  const [{ from, to }, setRange] = useState(periodRange('WEEKLY'));
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'generate' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changePeriod(p: SettlementPeriod) {
    setPeriod(p);
    if (p !== 'CUSTOM') setRange(periodRange(p));
    setPreview(null);
  }

  async function loadPreview() {
    if (!courierId) return;
    setBusy('preview');
    setError(null);
    try {
      setPreview(
        await api<SettlementPreview>(`/couriers/${courierId}/settlements/preview?from=${from}&to=${to}`),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!courierId) return;
    setBusy('generate');
    setError(null);
    try {
      await api(`/couriers/${courierId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({ period, from, to }),
      });
      setPreview(null);
      await history.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(id: string) {
    await api(`/settlements/${id}/pay`, { method: 'PATCH' });
    await history.reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-lg font-semibold">Liquidaciones</h1>
        <p className="mb-3 text-sm text-neutral-500">
          Pago a cada domiciliario por sus entregas en un período. Elegí domiciliario y período, revisá las
          entregas pendientes y generá la liquidación.
        </p>
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Domiciliario</label>
            <select
              value={courierId}
              onChange={(e) => {
                setCourierId(e.target.value);
                setPreview(null);
              }}
              className={field}
            >
              <option value="">Elegí…</option>
              {couriers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Período</label>
            <select value={period} onChange={(e) => changePeriod(e.target.value as SettlementPeriod)} className={field}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {SETTLEMENT_PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Desde</label>
            <input
              type="date"
              value={from}
              disabled={period !== 'CUSTOM'}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className={`${field} disabled:bg-neutral-50`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Hasta</label>
            <input
              type="date"
              value={to}
              disabled={period !== 'CUSTOM'}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className={`${field} disabled:bg-neutral-50`}
            />
          </div>
          <button
            onClick={loadPreview}
            disabled={!courierId || busy !== null}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
          >
            {busy === 'preview' ? 'Buscando…' : 'Ver pendientes'}
          </button>
          {error && <span className="w-full text-sm text-red-700">{error}</span>}
        </div>
      </div>

      {preview && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-700">
              {preview.orderCount} entrega(s) sin liquidar · Total {formatCop(preview.totalCop)}
            </p>
            <button onClick={generate} disabled={busy !== null || preview.orderCount === 0} className={btn}>
              {busy === 'generate' ? 'Generando…' : 'Generar liquidación'}
            </button>
          </div>
          {preview.missingRate > 0 && (
            <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800">
              ⚠ {preview.missingRate} entrega(s) sin tarifa de pago definida (cuentan como $0). Configurá la
              zona-tarifa del domiciliario en la pestaña Domiciliarios si querés incluirlas.
            </p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Zona</th>
                <th className="px-4 py-2">Entregado</th>
                <th className="px-4 py-2 text-right">Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {preview.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium">{o.code}</td>
                  <td className="px-4 py-2 text-neutral-600">{o.customer.name ?? o.customer.whatsappPhone}</td>
                  <td className="px-4 py-2 text-neutral-500">{o.deliveryZone ?? '—'}</td>
                  <td className="px-4 py-2 text-neutral-500">{formatDate(o.deliveredAt)}</td>
                  <td className="px-4 py-2 text-right">
                    {o.courierPayCop == null ? (
                      <span className="text-amber-600">sin tarifa</span>
                    ) : (
                      formatCop(o.courierPayCop)
                    )}
                  </td>
                </tr>
              ))}
              {preview.orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    No hay entregas sin liquidar en ese período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Liquidaciones generadas</h2>
        {history.data && (
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Domiciliario</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Rango</th>
                  <th className="px-4 py-2 text-center">Entregas</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {history.data.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-medium">{s.courier?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-neutral-600">{SETTLEMENT_PERIOD_LABEL[s.period]}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {formatDate(s.periodFrom)} – {formatDate(s.periodTo)}
                    </td>
                    <td className="px-4 py-2 text-center text-neutral-600">{s._count?.orders ?? s.orderCount}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCop(s.totalCop)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SETTLEMENT_STATUS_STYLE[s.status]}`}>
                        {SETTLEMENT_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.status === 'PENDING' && (
                        <button
                          onClick={() => markPaid(s.id)}
                          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100"
                        >
                          Marcar pagada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {history.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                      Todavía no hay liquidaciones.
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
