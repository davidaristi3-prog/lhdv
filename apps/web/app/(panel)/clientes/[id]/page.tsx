'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { StatusBadge } from '@/app/components/StatusBadge';
import { formatDate } from '@/lib/labels';
import type { Customer } from '@/lib/types';

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>();
  const { data: customer, loading, error, reload } = useApi<Customer>(`/customers/${params.id}`);

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [busy, setBusy] = useState(false);

  async function addAddress() {
    if (!address) return;
    setBusy(true);
    try {
      await api(`/customers/${params.id}/addresses`, {
        method: 'POST',
        body: JSON.stringify({ address, label: label || undefined, zone: zone || undefined }),
      });
      setLabel('');
      setAddress('');
      setZone('');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function removeAddress(addressId: string) {
    if (!confirm('¿Eliminar esta dirección?')) return;
    await api(`/customers/addresses/${addressId}`, { method: 'DELETE' });
    await reload();
  }

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!customer) return null;

  const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

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

      {/* Direcciones */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-neutral-200">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Direcciones</h2>
        <div className="space-y-2">
          {customer.addresses && customer.addresses.length > 0 ? (
            customer.addresses.map((a) => (
              <div key={a.id} className="flex items-start justify-between rounded-lg border border-neutral-200 p-3 text-sm">
                <div>
                  {a.label && <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium">{a.label}</span>}
                  <span>{a.address}</span>
                  {a.zone && <span className="block text-xs text-neutral-400">{a.zone}</span>}
                </div>
                <button onClick={() => removeAddress(a.id)} className="text-neutral-400 hover:text-red-600" title="Eliminar">
                  ✕
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-neutral-400">Sin direcciones guardadas.</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
          <input placeholder="Etiqueta (Casa…)" value={label} onChange={(e) => setLabel(e.target.value)} className={`w-32 ${field}`} />
          <input placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} className={`flex-1 ${field}`} />
          <input placeholder="Zona" value={zone} onChange={(e) => setZone(e.target.value)} className={`w-28 ${field}`} />
          <button
            onClick={addAddress}
            disabled={busy || !address}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>

      {/* Historial */}
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
