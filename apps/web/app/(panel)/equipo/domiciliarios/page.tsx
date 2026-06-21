'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { VEHICLE_LABEL } from '@/lib/labels';
import type { Courier, CourierVehicle, DeliveryZone } from '@/lib/types';

const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';
const VEHICLES: CourierVehicle[] = ['MOTO', 'CARRO'];
// Capacidad sugerida por vehículo, en "tortas grandes" equivalentes (ajustable).
const CAPACITY_PRESET: Record<CourierVehicle, number> = { MOTO: 5, CARRO: 15 };

export default function DomiciliariosPage() {
  const { data: couriers, loading, error, reload } = useApi<Courier[]>('/couriers');
  const { data: zones } = useApi<DeliveryZone[]>('/delivery-zones?all=true');

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Domiciliarios</h1>
        <p className="text-sm text-neutral-500">
          Vehículo, capacidad de carga y las zonas que cubre cada uno con su tarifa de pago por entrega
          (distinta de lo que se le cobra al cliente).
        </p>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {couriers && couriers.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-neutral-500 ring-1 ring-neutral-200">
          No hay domiciliarios. Creá usuarios con rol Domicilios en la pestaña Usuarios.
        </p>
      )}

      <div className="space-y-4">
        {couriers?.map((c) => (
          <CourierCard key={c.id} courier={c} zones={zones ?? []} reload={reload} />
        ))}
      </div>
    </div>
  );
}

function CourierCard({
  courier,
  zones,
  reload,
}: {
  courier: Courier;
  zones: DeliveryZone[];
  reload: () => void;
}) {
  const [vehicle, setVehicle] = useState<CourierVehicle | ''>(courier.vehicle ?? '');
  const [capacity, setCapacity] = useState(courier.capacityLimit?.toString() ?? '');
  const [rates, setRates] = useState<Record<string, { checked: boolean; payCop: number }>>(() => {
    const m: Record<string, { checked: boolean; payCop: number }> = {};
    for (const zr of courier.zoneRates) m[zr.zoneId] = { checked: true, payCop: zr.payCop };
    return m;
  });
  const [busy, setBusy] = useState<'profile' | 'zones' | null>(null);

  async function saveProfile() {
    setBusy('profile');
    try {
      await api(`/couriers/${courier.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          vehicle: vehicle || undefined,
          capacityLimit: capacity === '' ? null : Number(capacity),
        }),
      });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveZones() {
    setBusy('zones');
    try {
      const payload = Object.entries(rates)
        .filter(([, v]) => v.checked)
        .map(([zoneId, v]) => ({ zoneId, payCop: v.payCop }));
      await api(`/couriers/${courier.id}/zone-rates`, {
        method: 'PUT',
        body: JSON.stringify({ rates: payload }),
      });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function setRate(zoneId: string, patch: Partial<{ checked: boolean; payCop: number }>) {
    setRates((prev) => {
      const cur = prev[zoneId] ?? { checked: false, payCop: 0 };
      return { ...prev, [zoneId]: { ...cur, ...patch } };
    });
  }

  return (
    <div className={`rounded-xl bg-white p-5 ring-1 ring-neutral-200 ${courier.active ? '' : 'opacity-60'}`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-medium">{courier.name}</p>
          <p className="text-sm text-neutral-500">{courier.email}</p>
        </div>
        {!courier.active && (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">Inactivo</span>
        )}
      </div>

      {/* Perfil: vehículo + capacidad */}
      <div className="mb-1 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Vehículo</label>
          <select
            value={vehicle}
            onChange={(e) => {
              const v = e.target.value as CourierVehicle | '';
              setVehicle(v);
              // Al elegir vehículo, sugerimos su capacidad típica si está vacía.
              if (v && capacity === '') setCapacity(String(CAPACITY_PRESET[v]));
            }}
            className={field}
          >
            <option value="">—</option>
            {VEHICLES.map((v) => (
              <option key={v} value={v}>
                {VEHICLE_LABEL[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Capacidad (tortas grandes)</label>
          <input
            type="number"
            min={1}
            step={1}
            placeholder="Sin límite"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={`w-36 ${field}`}
          />
        </div>
        <button onClick={saveProfile} disabled={busy !== null} className={btn}>
          {busy === 'profile' ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </div>
      <p className="mb-4 text-xs text-neutral-400">
        La capacidad se mide en <b>tortas grandes</b>: una torta grande = 1. Cada producto define cuánto
        ocupa en el Catálogo (una caja mediana ≈ 0.5). Ej.: una moto lleva ~5 tortas grandes, o 2 grandes
        + 3 medianas. Al armar la ruta, el sistema suma y avisa si se pasa.
      </p>

      {/* Zonas + tarifa de pago */}
      <div className="border-t border-neutral-100 pt-3">
        <p className="mb-2 text-sm font-semibold text-neutral-700">Zonas que cubre y pago por entrega</p>
        {zones.length === 0 ? (
          <p className="text-sm text-neutral-400">No hay zonas configuradas todavía.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {zones.map((z) => {
              const r = rates[z.id] ?? { checked: false, payCop: 0 };
              return (
                <div
                  key={z.id}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                >
                  <label className="flex flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={(e) => setRate(z.id, { checked: e.target.checked })}
                    />
                    <span>{z.name}</span>
                    <span className="text-xs text-neutral-400">cliente {formatCop(z.deliveryCostCop)}</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Pago"
                    value={r.checked ? r.payCop || '' : ''}
                    disabled={!r.checked}
                    onChange={(e) => setRate(z.id, { payCop: Number(e.target.value) })}
                    className={`w-28 ${field} disabled:bg-neutral-50`}
                  />
                </div>
              );
            })}
          </div>
        )}
        <button onClick={saveZones} disabled={busy !== null} className={`mt-3 ${btn}`}>
          {busy === 'zones' ? 'Guardando…' : 'Guardar zonas'}
        </button>
      </div>
    </div>
  );
}
