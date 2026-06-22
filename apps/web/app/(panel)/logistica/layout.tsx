'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/logistica/domicilios', label: 'Domicilios', icon: '🛵', hint: 'Rutas y envíos a domicilio' },
  { href: '/logistica/recoger', label: 'Recoger en el local', icon: '📦', hint: 'Pedidos que el cliente recoge' },
];

/** Logística: el área que concentra toda la entrega, con dos secciones en pestañas grandes. */
export default function LogisticaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Logística</h1>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex items-center gap-4 rounded-2xl px-5 py-4 ring-1 transition ${
                active
                  ? 'bg-neutral-900 text-white shadow-sm ring-neutral-900'
                  : 'bg-white text-neutral-700 ring-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <span className="text-3xl">{t.icon}</span>
              <span className="flex flex-col">
                <span className="text-base font-semibold">{t.label}</span>
                <span className={`text-xs ${active ? 'text-neutral-300' : 'text-neutral-400'}`}>{t.hint}</span>
              </span>
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
