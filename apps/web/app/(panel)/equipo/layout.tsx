'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/equipo', label: 'Usuarios' },
  { href: '/equipo/domiciliarios', label: 'Domiciliarios' },
  { href: '/equipo/liquidaciones', label: 'Liquidaciones' },
];

export default function EquipoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => {
          const active = t.href === '/equipo' ? pathname === '/equipo' : pathname.startsWith(t.href);
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
