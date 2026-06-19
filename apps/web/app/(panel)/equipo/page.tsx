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
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
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
      <h1 className="mb-5 text-lg font-semibold">Equipo</h1>

      <div className="mb-5 rounded-xl bg-white p-4 ring-1 ring-neutral-200">
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
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => (
                <UserRow key={u.id} u={u} isMe={u.id === me?.id} reload={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({ u, isMe, reload }: { u: PanelUser; isMe: boolean; reload: () => void }) {
  const [busy, setBusy] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setBusy(true);
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
    const p = prompt(`Nueva contraseña para ${u.name} (mínimo 6 caracteres):`);
    if (!p) return;
    if (p.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    await patch({ password: p });
    alert('Contraseña actualizada.');
  }

  return (
    <tr className={`hover:bg-neutral-50 ${u.active ? '' : 'opacity-50'}`}>
      <td className="px-4 py-3 font-medium">
        {u.name}
        {isMe && <span className="ml-1 text-xs text-neutral-400">(vos)</span>}
      </td>
      <td className="px-4 py-3 text-neutral-600">{u.email}</td>
      <td className="px-4 py-3">
        <select
          value={u.role}
          onChange={(e) => patch({ role: e.target.value })}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        {u.active ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Activo</span>
        ) : (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">Inactivo</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button onClick={resetPassword} disabled={busy} className="text-neutral-500 hover:text-neutral-900">
            Clave
          </button>
          <button
            onClick={() => patch({ active: !u.active })}
            disabled={busy || (isMe && u.active)}
            title={isMe && u.active ? 'No podés desactivarte a vos misma' : ''}
            className={`font-medium ${u.active ? 'text-red-600 hover:text-red-800' : 'text-green-700 hover:text-green-900'} disabled:opacity-30`}
          >
            {u.active ? 'Desactivar' : 'Reactivar'}
          </button>
        </div>
      </td>
    </tr>
  );
}
