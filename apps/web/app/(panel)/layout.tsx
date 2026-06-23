'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/labels';
import type { Role } from '@/lib/types';

interface NavLink {
  href: string;
  label: string;
  roles: Role[];
}
interface NavGroup {
  label: string;
  children: NavLink[];
}
type NavEntry = NavLink | NavGroup;

const isGroup = (n: NavEntry): n is NavGroup => 'children' in n;

const NAV: NavEntry[] = [
  { href: '/pedidos', label: 'Comercial', roles: ['OWNER', 'SALES', 'KITCHEN'] },
  { href: '/cocina', label: 'Producción', roles: ['OWNER', 'KITCHEN', 'SALES'] },
  { href: '/logistica', label: 'Logística', roles: ['OWNER'] },
  { href: '/seguimiento', label: 'Seguimiento', roles: ['OWNER', 'SALES'] },
  { href: '/mi-ruta', label: 'Mi ruta', roles: ['OWNER', 'DELIVERY'] },
  { href: '/mi-cuenta', label: 'Mi cuenta', roles: ['DELIVERY'] },
  { href: '/contabilidad', label: 'Contabilidad', roles: ['OWNER'] },
  {
    // Datos base del negocio que se configuran una vez y casi no cambian.
    label: 'Base de datos',
    children: [
      { href: '/clientes', label: 'Clientes', roles: ['OWNER', 'SALES'] },
      { href: '/catalogo', label: 'Catálogo', roles: ['OWNER'] },
      { href: '/inventario', label: 'Inventario', roles: ['OWNER'] },
      { href: '/productos-listos', label: 'Productos listos', roles: ['OWNER', 'KITCHEN'] },
      { href: '/cuentas-cobro', label: 'Cuentas de cobro', roles: ['OWNER', 'SALES'] },
      { href: '/zonas', label: 'Zonas', roles: ['OWNER'] },
      { href: '/equipo', label: 'Equipo', roles: ['OWNER'] },
      { href: '/bot-prueba', label: '🤖 Bot (prueba)', roles: ['OWNER'] },
    ],
  },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Cierra menús al cambiar de página.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Cierra el desplegable desktop al hacer clic fuera de la barra.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (loading || !user) {
    return <div className="p-10 text-center text-neutral-500">Cargando…</div>;
  }

  const role = user.role;
  const entries = NAV.filter((n) =>
    isGroup(n) ? n.children.some((c) => c.roles.includes(role)) : n.roles.includes(role),
  );

  const linkClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
    }`;

  const mobileLinkClass = (active: boolean) =>
    `block rounded-lg px-3 py-2.5 text-sm font-medium ${
      active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
    }`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-6">
            <span className="font-semibold">🦌 La Hora del Venado</span>
            {/* Nav desktop */}
            <nav ref={navRef} className="hidden gap-1 md:flex">
              {entries.map((n) => {
                if (!isGroup(n)) {
                  return (
                    <Link key={n.href} href={n.href} className={linkClass(pathname.startsWith(n.href))}>
                      {n.label}
                    </Link>
                  );
                }
                const children = n.children.filter((c) => c.roles.includes(role));
                const active = children.some((c) => pathname.startsWith(c.href));
                const open = openMenu === n.label;
                return (
                  <div key={n.label} className="relative">
                    <button
                      onClick={() => setOpenMenu(open ? null : n.label)}
                      className={`${linkClass(active)} flex items-center gap-1`}
                    >
                      {n.label}
                      <span className="text-xs">▾</span>
                    </button>
                    {open && (
                      <div className="absolute left-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200">
                        {children.map((c) => (
                          <Link
                            key={c.href}
                            href={c.href}
                            className={`block px-3 py-2 text-sm font-medium ${
                              pathname.startsWith(c.href)
                                ? 'bg-neutral-100 text-neutral-900'
                                : 'text-neutral-600 hover:bg-neutral-50'
                            }`}
                          >
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {/* Usuario + salir — solo desktop */}
            <Link
              href="/cuenta"
              className="hidden rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 md:block"
              title="Mi cuenta"
            >
              {user.name} · {ROLE_LABEL[user.role]}
            </Link>
            <button
              onClick={logout}
              className="hidden rounded-lg px-3 py-1.5 font-medium text-neutral-600 hover:bg-neutral-100 md:block"
            >
              Salir
            </button>

            {/* Botón hamburguesa — solo mobile */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden"
              aria-label="Menú"
            >
              {mobileOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Menú móvil desplegable */}
        {mobileOpen && (
          <div className="border-t border-neutral-100 px-4 pb-4 pt-2 md:hidden">
            <div className="space-y-0.5">
              {entries.map((n) => {
                if (!isGroup(n)) {
                  return (
                    <Link key={n.href} href={n.href} className={mobileLinkClass(pathname.startsWith(n.href))}>
                      {n.label}
                    </Link>
                  );
                }
                const children = n.children.filter((c) => c.roles.includes(role));
                return (
                  <div key={n.label}>
                    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      {n.label}
                    </p>
                    {children.map((c) => (
                      <Link key={c.href} href={c.href} className={mobileLinkClass(pathname.startsWith(c.href))}>
                        {c.label}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <p className="px-3 pb-2 text-xs text-neutral-400">
                {user.name} · {ROLE_LABEL[user.role]}
              </p>
              <button
                onClick={logout}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Salir
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
