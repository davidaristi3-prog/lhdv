'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/labels';

export default function CuentaPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ type: 'err', text: 'La nueva contraseña y su confirmación no coinciden.' });
      return;
    }
    if (next.length < 6) {
      setMsg({ type: 'err', text: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setMsg({ type: 'ok', text: 'Tu contraseña fue actualizada.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-lg font-semibold">Mi cuenta</h1>

      <div className="rounded-xl bg-white p-5 text-sm ring-1 ring-neutral-200">
        <p className="font-medium">{user?.name}</p>
        <p className="text-neutral-500">{user?.email}</p>
        <p className="mt-1 text-xs text-neutral-400">Rol: {user ? ROLE_LABEL[user.role] : '—'}</p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-5 ring-1 ring-neutral-200">
        <p className="text-sm font-semibold text-neutral-700">Cambiar contraseña</p>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Contraseña actual</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Nueva contraseña</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Repetir nueva contraseña</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={field} />
        </div>

        {msg && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        <p className="text-xs text-neutral-400">Mínimo 6 caracteres.</p>
      </form>
    </div>
  );
}
