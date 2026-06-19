'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/labels';
import type { Role } from '@/lib/types';

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: '/pedidos', label: 'Pedidos', roles: ['OWNER', 'SALES', 'KITCHEN', 'DELIVERY'] },
  { href: '/cocina', label: 'Cocina', roles: ['OWNER', 'KITCHEN'] },
  { href: '/clientes', label: 'Clientes', roles: ['OWNER', 'SALES'] },
  { href: '/catalogo', label: 'Catálogo', roles: ['OWNER'] },
  { href: '/contabilidad', label: 'Contabilidad', roles: ['OWNER'] },
  { href: '/equipo', label: 'Equipo', roles: ['OWNER'] },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="p-10 text-center text-neutral-500">Cargando…</div>;
  }

  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">🦌 La Hora del Venado</span>
            <nav className="flex gap-1">
              {items.map((n) => {
                const active = pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      active
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500">
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
