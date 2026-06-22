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
    <div className="mx-auto max-w-3xl">
      {/*
        Impresión: @page margin 0 hace que el navegador NO imprima sus encabezados/pies
        (URL, fecha, título, número de página). El margen visual lo da el padding del .doc.
        El documento se vuelve flex-column de alto completo para repartir el contenido y
        dejar los datos de pago al pie de la hoja.
      */}
      <style>{`
        @page { margin: 0; }
        @media print {
          header, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          html, body { background: #fff !important; }
          .doc {
            max-width: none !important;
            margin: 0 !important;
            min-height: 100vh;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 1.6cm 1.9cm !important;
            display: flex;
            flex-direction: column;
            font-size: 12.5pt;
          }
          .doc .pay { margin-top: auto; }
        }
      `}</style>

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

      <div className="doc rounded-xl bg-white p-10 ring-1 ring-neutral-200">
        {/* Logo (si todavía no se subió el archivo, se oculta sin romper nada). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-lhdv.png"
          alt="La Hora del Venado"
          className="mx-auto mb-6 h-28 w-auto"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />

        <div className="flex items-end justify-between border-b border-neutral-300 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CUENTA DE COBRO</h1>
            <p className="text-lg font-semibold text-neutral-700">N° {inv.number}</p>
          </div>
          <p className="text-sm text-neutral-500">{formatDate(inv.issuedAt)}</p>
        </div>

        <div className="mt-5 text-sm leading-relaxed">
          <p className="text-base font-bold">{s.companyName}</p>
          <p className="text-neutral-600">{s.companyAddress}</p>
          <p className="text-neutral-600">Contacto: {s.companyContact}</p>
          <p className="mt-1 text-neutral-600">
            Vendedor: {s.sellerName} · CC: {s.sellerCC} · RUT: {s.sellerRut}
          </p>
        </div>

        <div className="mt-5 rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed ring-1 ring-neutral-200">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Cliente</p>
          <p className="text-base font-medium">
            {inv.customerName}
            {inv.customerTaxId ? ` · CC/NIT: ${inv.customerTaxId}` : ''}
          </p>
          {inv.customerAddress && <p className="text-neutral-600">{inv.customerAddress}</p>}
          {inv.customerPhone && <p className="text-neutral-600">{inv.customerPhone}</p>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="border-b-2 border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-16 py-3">Cant.</th>
              <th className="py-3">Producto</th>
              <th className="py-3 text-right">Costo unit.</th>
              <th className="py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {inv.items.map((it, i) => (
              <tr key={i}>
                <td className="py-3">{it.quantity}</td>
                <td className="py-3">{it.name}</td>
                <td className="py-3 text-right">{formatCop(it.unitPriceCop)}</td>
                <td className="py-3 text-right">{formatCop(it.totalCop)}</td>
              </tr>
            ))}
            {inv.deliveryCop > 0 && (
              <tr>
                <td className="py-3">1</td>
                <td className="py-3">Domicilio</td>
                <td className="py-3 text-right">{formatCop(inv.deliveryCop)}</td>
                <td className="py-3 text-right">{formatCop(inv.deliveryCop)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-900">
              <td colSpan={3} className="py-3 text-right text-base font-bold">
                Total
              </td>
              <td className="py-3 text-right text-base font-bold">{formatCop(inv.totalCop)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="pay mt-10 border-t border-neutral-200 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Datos de pago</p>
          <p className="mt-1 text-sm text-neutral-600">{s.paymentInfo}</p>
        </div>
      </div>
    </div>
  );
}
