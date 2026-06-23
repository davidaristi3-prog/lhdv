'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/contabilidad', label: 'Resumen' },
  { href: '/contabilidad/gastos', label: 'Gastos y compras' },
  { href: '/contabilidad/fijos', label: 'Gastos fijos' },
  { href: '/contabilidad/costeo', label: 'Costeo' },
];

export default function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => {
          const active =
            t.href === '/contabilidad' ? pathname === '/contabilidad' : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                active
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
