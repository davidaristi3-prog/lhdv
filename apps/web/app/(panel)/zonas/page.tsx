'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import type { DeliveryZone } from '@/lib/types';

const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';

export default function ZonasPage() {
  const { data: zones, loading, error, reload } = useApi<DeliveryZone[]>('/delivery-zones?all=true');

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Zonas de domicilio</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Área Metropolitana del Valle de Aburrá. El costo se asigna por zona; los <i>alias</i> (barrios)
        ayudan a detectar la zona desde la dirección del cliente.
      </p>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {zones?.map((z) => (
          <ZoneRow key={z.id} zone={z} reload={reload} />
        ))}
      </div>

      <NewZone reload={reload} />
    </div>
  );
}

function ZoneRow({ zone, reload }: { zone: DeliveryZone; reload: () => void }) {
  const [cost, setCost] = useState(zone.deliveryCostCop);
  const [aliases, setAliases] = useState(zone.aliases.join(', '));
  const [busy, setBusy] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/delivery-zones/${zone.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar la zona ${zone.name}?`)) return;
    await api(`/delivery-zones/${zone.id}`, { method: 'DELETE' });
    await reload();
  }

  const aliasesArray = () => aliases.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className={`rounded-xl bg-white p-4 ring-1 ring-neutral-200 ${zone.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-28 font-medium">{zone.name}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-400">$</span>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
            className={`w-28 ${field}`}
          />
          <button onClick={() => patch({ deliveryCostCop: cost })} disabled={busy || cost === zone.deliveryCostCop} className={btn}>
            Guardar
          </button>
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-neutral-500">
          <input type="checkbox" checked={zone.active} onChange={(e) => patch({ active: e.target.checked })} />
          Activa
        </label>
        <button onClick={remove} className="text-neutral-400 hover:text-red-600" title="Eliminar">
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-neutral-400">Alias:</span>
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="barrios separados por coma"
          className={`flex-1 ${field}`}
        />
        <button
          onClick={() => patch({ aliases: aliasesArray() })}
          disabled={busy || aliases === zone.aliases.join(', ')}
          className={btn}
        >
          Guardar alias
        </button>
      </div>
    </div>
  );
}

function NewZone({ reload }: { reload: () => void }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await api('/delivery-zones', { method: 'POST', body: JSON.stringify({ name, deliveryCostCop: cost }) });
      setName('');
      setCost(0);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-4">
      <p className="mb-2 text-sm font-medium text-neutral-600">Nueva zona</p>
      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Nombre (ej. Rionegro)" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <input
          type="number"
          placeholder="Costo"
          value={cost || ''}
          onChange={(e) => setCost(Number(e.target.value))}
          className={`w-32 ${field}`}
        />
        <button onClick={add} disabled={!name || !cost} className={btn}>
          Agregar
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
