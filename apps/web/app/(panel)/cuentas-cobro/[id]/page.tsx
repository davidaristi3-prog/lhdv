'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCop } from '@lhdv/shared';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/labels';

interface InvoiceItem {
  quantity: number;
  name: string;
  unitPriceCop: number;
  totalCop: number;
}
interface Invoice {
  id: string;
  number: number;
  customerName: string;
  customerTaxId: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  items: InvoiceItem[];
  subtotalCop: number;
  deliveryCop: number;
  totalCop: number;
  issuedAt: string;
  settings: {
    companyName: string;
    companyAddress: string;
    companyContact: string;
    sellerName: string;
    sellerCC: string;
    sellerRut: string;
    paymentInfo: string;
  };
}

export default function CuentaCobroDetallePage() {
  const params = useParams<{ id: string }>();
  const { data: inv, loading, error } = useApi<Invoice>(`/invoices/${params.id}`);

  if (loading) return <p className="text-neutral-500">Cargando…</p>;
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!inv) return null;
  const s = inv.settings;

  return (
    <div className="mx-auto max-w-2xl">
      {/* En impresión, oculta el menú del panel y deja solo el documento. */}
      <style>{`@media print { header, .no-print { display: none !important; } main { padding: 0 !important; max-width: none !important; } }`}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/cuentas-cobro" className="text-sm text-neutral-500 hover:underline">
          ← Cuentas de cobro
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          🖨 Imprimir / Guardar PDF
        </button>
      </div>

      <div className="rounded-xl bg-white p-8 ring-1 ring-neutral-200 print:ring-0">
        <h1 className="text-xl font-bold">CUENTA DE COBRO {inv.number}</h1>
        <p className="text-sm text-neutral-500">{formatDate(inv.issuedAt)}</p>

        <div className="mt-4 border-t border-neutral-200 pt-4 text-sm">
          <p className="font-bold">{s.companyName}</p>
          <p className="text-neutral-600">{s.companyAddress}</p>
          <p className="text-neutral-600">Contacto: {s.companyContact}</p>
          <p className="mt-1 text-neutral-600">
            Vendedor: {s.sellerName} · CC: {s.sellerCC} · RUT: {s.sellerRut}
          </p>
        </div>

        <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm">
          <p className="font-semibold">Cliente</p>
          <p>
            {inv.customerName}
            {inv.customerTaxId ? ` · CC/NIT: ${inv.customerTaxId}` : ''}
          </p>
          {inv.customerAddress && <p className="text-neutral-600">{inv.customerAddress}</p>}
          {inv.customerPhone && <p className="text-neutral-600">{inv.customerPhone}</p>}
        </div>

        <table className="mt-4 w-full text-sm">
          <thead className="border-b border-neutral-300 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2">Cant.</th>
              <th className="py-2">Producto</th>
              <th className="py-2 text-right">Costo unit.</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {inv.items.map((it, i) => (
              <tr key={i}>
                <td className="py-2">{it.quantity}</td>
                <td className="py-2">{it.name}</td>
                <td className="py-2 text-right">{formatCop(it.unitPriceCop)}</td>
                <td className="py-2 text-right">{formatCop(it.totalCop)}</td>
              </tr>
            ))}
            {inv.deliveryCop > 0 && (
              <tr>
                <td className="py-2">1</td>
                <td className="py-2">Domicilio</td>
                <td className="py-2 text-right">{formatCop(inv.deliveryCop)}</td>
                <td className="py-2 text-right">{formatCop(inv.deliveryCop)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-900">
              <td colSpan={3} className="py-2 text-right font-bold">
                Total
              </td>
              <td className="py-2 text-right font-bold">{formatCop(inv.totalCop)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-6 border-t border-neutral-200 pt-3 text-xs text-neutral-600">{s.paymentInfo}</p>
      </div>
    </div>
  );
}
