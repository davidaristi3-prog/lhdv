'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/labels';
import type { Role } from '@/lib/types';

interface PanelUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

const ROLES: Role[] = ['OWNER', 'SALES', 'KITCHEN', 'DELIVERY'];
const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';

export default function EquipoPage() {
  const { user: me } = useAuth();
  const { data: users, loading, error, reload } = useApi<PanelUser[]>('/users');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('SALES');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setFormError(null);
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      setName('');
      setEmail('');
      setPassword('');
      setRole('SALES');
      await reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="mb-5 text-lg font-semibold">Usuarios</h1>

      <div className="mb-6 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
        <p className="mb-3 text-sm font-semibold text-neutral-700">Agregar usuario</p>
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <input
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`flex-1 ${field}`}
          />
          <input
            type="password"
            placeholder="Contraseña inicial"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={field}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button onClick={create} disabled={busy || !name || !email || password.length < 6} className={btn}>
            Agregar
          </button>
        </div>
        {formError && <p className="mt-2 text-sm text-red-700">{formError}</p>}
        <p className="mt-2 text-xs text-neutral-400">La contraseña debe tener al menos 6 caracteres.</p>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {users && (
        <div className="space-y-2">
          {users.map((u) => (
            <UserCard key={u.id} u={u} isMe={u.id === me?.id} reload={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ u, isMe, reload }: { u: PanelUser; isMe: boolean; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setBusy(true);
    setMenuOpen(false);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setMenuOpen(false);
    const p = prompt(`Nueva contraseña para ${u.name} (mínimo 6 caracteres):`);
    if (!p) return;
    if (p.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    await patch({ password: p });
    alert('Contraseña actualizada.');
  }

  const cannotDeactivate = isMe && u.active;

  return (
    <div
      className={`flex items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-neutral-200 ${
        u.active ? '' : 'bg-neutral-50'
      }`}
    >
      {/* Identidad */}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${u.active ? '' : 'text-neutral-500'}`}>
          {u.name}
          {isMe && <span className="ml-1.5 text-xs font-normal text-neutral-400">(vos)</span>}
        </p>
        <p className="truncate text-sm text-neutral-500">{u.email}</p>
      </div>

      {/* Rol */}
      <label className="hidden text-xs text-neutral-400 sm:block">Rol</label>
      <select
        value={u.role}
        onChange={(e) => patch({ role: e.target.value })}
        disabled={busy}
        className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900 disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>

      {/* Estado */}
      <span
        className={`w-20 rounded-full px-2 py-0.5 text-center text-xs font-medium ${
          u.active ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {u.active ? 'Activo' : 'Inactivo'}
      </span>

      {/* Acciones */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
        >
          Acciones ▾
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-neutral-200">
              <MenuItem onClick={resetPassword}>🔑 Restablecer contraseña</MenuItem>
              {u.active ? (
                <MenuItem
                  onClick={() => !cannotDeactivate && patch({ active: false })}
                  disabled={cannotDeactivate}
                  tone="danger"
                  hint={cannotDeactivate ? 'No podés desactivarte a vos misma' : undefined}
                >
                  ⛔ Desactivar usuario
                </MenuItem>
              ) : (
                <MenuItem onClick={() => patch({ active: true })} tone="ok">
                  ✅ Reactivar usuario
                </MenuItem>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  tone,
  hint,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger' | 'ok';
  hint?: string;
}) {
  const color =
    tone === 'danger' ? 'text-red-600' : tone === 'ok' ? 'text-green-700' : 'text-neutral-700';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 ${color}`}
    >
      {children}
      {hint && <span className="block text-xs text-neutral-400">{hint}</span>}
    </button>
  );
}
