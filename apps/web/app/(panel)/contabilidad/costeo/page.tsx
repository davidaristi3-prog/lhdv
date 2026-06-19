'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import type { Ingredient, Product, Recipe } from '@/lib/types';

const card = 'rounded-xl bg-white p-5 ring-1 ring-neutral-200';
const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';

export default function CosteoPage() {
  const ingredients = useApi<Ingredient[]>('/ingredients?all=true');
  const products = useApi<Product[]>('/catalog/products?all=true');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <IngredientsCard data={ingredients.data ?? []} reload={ingredients.reload} />
      <RecipeCard ingredients={ingredients.data ?? []} products={products.data ?? []} />
    </div>
  );
}

function IngredientsCard({ data, reload }: { data: Ingredient[]; reload: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('g');
  const [cost, setCost] = useState(0);

  async function add() {
    await api('/ingredients', { method: 'POST', body: JSON.stringify({ name, unit, costPerUnitCop: cost }) });
    setName('');
    setCost(0);
    reload();
  }

  return (
    <div className={card}>
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">Insumos (costo por unidad)</h2>
      <div className="space-y-2">
        {data.map((i) => (
          <IngredientRow key={i.id} ing={i} reload={reload} />
        ))}
        {data.length === 0 && <p className="text-sm text-neutral-400">Sin insumos todavía.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <input placeholder="Insumo" value={name} onChange={(e) => setName(e.target.value)} className={`flex-1 ${field}`} />
        <input placeholder="Unidad" value={unit} onChange={(e) => setUnit(e.target.value)} className={`w-20 ${field}`} />
        <input
          type="number"
          placeholder="$/unidad"
          value={cost || ''}
          onChange={(e) => setCost(Number(e.target.value))}
          className={`w-24 ${field}`}
        />
        <button onClick={add} disabled={!name || !unit || !cost} className={btn}>
          + Insumo
        </button>
      </div>
    </div>
  );
}

function IngredientRow({ ing, reload }: { ing: Ingredient; reload: () => void }) {
  const [cost, setCost] = useState(ing.costPerUnitCop);
  async function save() {
    await api(`/ingredients/${ing.id}`, { method: 'PATCH', body: JSON.stringify({ costPerUnitCop: cost }) });
    reload();
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1">
        {ing.name} <span className="text-neutral-400">/ {ing.unit}</span>
      </span>
      <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} className={`w-24 ${field}`} />
      <button onClick={save} disabled={cost === ing.costPerUnitCop} className={btn}>
        Guardar
      </button>
    </div>
  );
}

interface DraftRow {
  ingredientId: string;
  quantity: number;
}

function RecipeCard({ ingredients, products }: { ingredients: Ingredient[]; products: Product[] }) {
  const variants = useMemo(
    () =>
      products.flatMap((p) =>
        p.variants.map((v) => ({ id: v.id, label: `${p.name} · ${v.name}`, price: v.priceCop })),
      ),
    [products],
  );
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const [variantId, setVariantId] = useState('');
  const [items, setItems] = useState<DraftRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!variantId) {
      setItems([]);
      return;
    }
    setSaved(false);
    api<Recipe>(`/ingredients/recipe/${variantId}`)
      .then((r) => setItems(r.items.map((it) => ({ ingredientId: it.ingredientId, quantity: it.quantity }))))
      .catch(() => setItems([]));
  }, [variantId]);

  const cost = Math.round(
    items.reduce((s, it) => s + (ingById.get(it.ingredientId)?.costPerUnitCop ?? 0) * it.quantity, 0),
  );
  const variant = variants.find((v) => v.id === variantId);
  const price = variant?.price ?? 0;
  const margin = price - cost;
  const marginPct = price ? Math.round((margin / price) * 100) : 0;

  async function save() {
    setBusy(true);
    try {
      await api(`/ingredients/recipe/${variantId}`, {
        method: 'PUT',
        body: JSON.stringify({ items: items.filter((i) => i.ingredientId && i.quantity > 0) }),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={card}>
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">Receta y margen por presentación</h2>
      <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className={`w-full ${field}`}>
        <option value="">Elegí una presentación…</option>
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>

      {variantId && (
        <div className="mt-4 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={it.ingredientId}
                onChange={(e) =>
                  setItems((p) => p.map((x, idx) => (idx === i ? { ...x, ingredientId: e.target.value } : x)))
                }
                className={`flex-1 ${field}`}
              >
                <option value="">Insumo…</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} ({ing.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={it.quantity || ''}
                onChange={(e) =>
                  setItems((p) => p.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) } : x)))
                }
                className={`w-24 ${field}`}
                placeholder="cant."
              />
              <button
                onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                className="text-neutral-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setItems((p) => [...p, { ingredientId: '', quantity: 0 }])}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            + Insumo a la receta
          </button>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-3 text-sm">
            <div>
              <p className="text-xs text-neutral-500">Costo insumos</p>
              <p className="font-semibold">{formatCop(cost)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Precio</p>
              <p className="font-semibold">{formatCop(price)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Margen</p>
              <p className={`font-semibold ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCop(margin)} ({marginPct}%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={busy} className={btn}>
              {busy ? 'Guardando…' : 'Guardar receta'}
            </button>
            {saved && <span className="text-sm text-emerald-600">Guardada ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
