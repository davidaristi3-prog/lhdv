'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/labels';

interface Invoice {
  id: string;
  number: number;
  customerName: string;
  totalCop: number;
  issuedAt: string;
}
interface Settings {
  companyName: string;
  companyAddress: string;
  companyContact: string;
  sellerName: string;
  sellerCC: string;
  sellerRut: string;
  paymentInfo: string;
  nextNumber: number;
}

const SETTING_FIELDS: [keyof Settings, string][] = [
  ['companyName', 'Empresa'],
  ['companyAddress', 'Dirección de la empresa'],
  ['companyContact', 'Contacto'],
  ['sellerName', 'Vendedor'],
  ['sellerCC', 'CC del vendedor'],
  ['sellerRut', 'RUT'],
  ['paymentInfo', 'Datos de pago'],
];

export default function CuentasCobroPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const { data: invoices } = useApi<Invoice[]>('/invoices');
  const { data: settings, reload } = useApi<Settings>('/invoices/settings');
  const [showSettings, setShowSettings] = useState(false);

  async function saveSettings(patch: Partial<Settings>) {
    await api('/invoices/settings', { method: 'PATCH', body: JSON.stringify(patch) });
    await reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Cuentas de cobro</h1>
        {isOwner && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            ⚙ Configuración
          </button>
        )}
      </div>

      {showSettings && settings && (
        <div className="rounded-xl bg-white p-5 ring-1 ring-neutral-200">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Empresa, vendedor y consecutivo</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SETTING_FIELDS.map(([key, lbl]) => (
              <label key={key} className="text-sm">
                <span className="mb-1 block text-neutral-600">{lbl}</span>
                <input
                  defaultValue={settings[key] as string}
                  onBlur={(e) => saveSettings({ [key]: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              </label>
            ))}
            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">Próximo consecutivo</span>
              <input
                type="number"
                defaultValue={settings.nextNumber}
                onBlur={(e) => saveSettings({ nextNumber: Number(e.target.value) })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Los cambios se guardan al salir de cada casilla.</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(invoices ?? []).map((inv) => (
              <tr key={inv.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/cuentas-cobro/${inv.id}`} className="text-blue-700 hover:underline">
                    {inv.number}
                  </Link>
                </td>
                <td className="px-4 py-3">{inv.customerName}</td>
                <td className="px-4 py-3 text-neutral-600">{formatDate(inv.issuedAt)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCop(inv.totalCop)}</td>
              </tr>
            ))}
            {invoices && invoices.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Todavía no hay cuentas de cobro. Se generan al crear un pedido.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
