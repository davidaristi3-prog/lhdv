'use client';

import { formatCop } from '@lhdv/shared';
import { useApi } from '@/lib/use-api';
import {
  formatDate,
  SETTLEMENT_PERIOD_LABEL,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_STYLE,
} from '@/lib/labels';
import type { CourierAccount } from '@/lib/types';

function Stat({
  label,
  count,
  totalCop,
  highlight,
}: {
  label: string;
  count: number;
  totalCop: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${
        highlight ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white ring-neutral-200'
      }`}
    >
      <p className={`text-xs ${highlight ? 'text-neutral-300' : 'text-neutral-500'}`}>{label}</p>
      <p className="mt-1 text-2xl font-semibold">{formatCop(totalCop)}</p>
      <p className={`text-xs ${highlight ? 'text-neutral-400' : 'text-neutral-400'}`}>
        {count} domicilio{count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export default function MiCuentaPage() {
  const { data, loading, error } = useApi<CourierAccount>('/couriers/me/account');

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Mi cuenta</h1>
        <p className="text-sm text-neutral-500">Tus domicilios y lo que llevás ganado.</p>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Esta semana" count={data.week.count} totalCop={data.week.totalCop} highlight />
            <Stat label="Este mes" count={data.month.count} totalCop={data.month.totalCop} />
            <Stat label="Pendiente de pago" count={data.pending.count} totalCop={data.pending.totalCop} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">Liquidaciones</h2>
            {data.settlements.length === 0 ? (
              <p className="rounded-xl bg-white p-6 text-center text-sm text-neutral-400 ring-1 ring-neutral-200">
                Todavía no tenés liquidaciones. Lo pendiente de pago se liquida por períodos.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-2">Período</th>
                      <th className="px-4 py-2 text-right">Domicilios</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.settlements.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2">
                          {formatDate(s.periodFrom)} – {formatDate(s.periodTo)}
                          <span className="block text-xs text-neutral-400">
                            {SETTLEMENT_PERIOD_LABEL[s.period]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-neutral-600">{s.orderCount}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCop(s.totalCop)}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${SETTLEMENT_STATUS_STYLE[s.status]}`}
                          >
                            {SETTLEMENT_STATUS_LABEL[s.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
