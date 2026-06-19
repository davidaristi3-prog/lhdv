'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCop } from '@lhdv/shared';
import { useApi } from '@/lib/use-api';
import { StatusBadge } from '@/app/components/StatusBadge';
import { formatDate } from '@/lib/labels';
import type { Customer } from '@/lib/types';

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>();
  const { data: customer, loading, error } = useApi<Customer>(`/customers/${params.id}`);

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!customer) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/clientes" className="text-sm text-neutral-500 hover:underline">
          ← Clientes
        </Link>
        <h1 className="text-lg font-semibold">{customer.name ?? 'Cliente'}</h1>
      </div>

      <div className="rounded-xl bg-white p-5 text-sm ring-1 ring-neutral-200">
        <p className="text-neutral-500">WhatsApp</p>
        <p className="font-medium">{customer.whatsappPhone}</p>
        {customer.notes && <p className="mt-2 text-neutral-500">Nota: {customer.notes}</p>}
      </div>

      <div className="rounded-xl bg-white p-5 ring-1 ring-neutral-200">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Historial de pedidos</h2>
        {customer.orders && customer.orders.length > 0 ? (
          <div className="divide-y divide-neutral-100">
            {customer.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/pedidos/${o.id}`} className="font-medium text-blue-700 hover:underline">
                  {o.code}
                </Link>
                <div className="flex items-center gap-3">
                  <StatusBadge status={o.status} />
                  <span className="text-neutral-400">{formatDate(o.deliveryDate)}</span>
                  <span className="w-24 text-right font-medium">{formatCop(o.totalCop)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Sin pedidos todavía.</p>
        )}
      </div>
    </div>
  );
}
