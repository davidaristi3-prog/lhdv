'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/labels';
import type { Customer } from '@/lib/types';

export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const { data: customers, loading, error, reload } = useApi<Customer[]>(
    `/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setFormError(null);
    setBusy(true);
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({ whatsappPhone: phone, name: name || undefined }),
      });
      setPhone('');
      setName('');
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold">Clientes</h1>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        <input
          placeholder="WhatsApp (+57…)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={field}
        />
        <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <button
          onClick={create}
          disabled={busy || !phone}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          Agregar
        </button>
        {formError && <span className="text-sm text-red-700">{formError}</span>}
      </div>

      <input
        placeholder="Buscar por nombre o WhatsApp…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`mb-4 w-full ${field}`}
      />

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {customers && (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3 text-right">Pedidos</th>
                <th className="px-4 py-3 text-right">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/clientes/${c.id}`} className="text-blue-700 hover:underline">
                      {c.name ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{c.whatsappPhone}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">{c._count?.orders ?? 0}</td>
                  <td className="px-4 py-3 text-right text-neutral-400">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
