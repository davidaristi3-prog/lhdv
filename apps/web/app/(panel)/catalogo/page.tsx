'use client';

import { useState } from 'react';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import type { Addition, Product, Variant } from '@/lib/types';

const field = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';

export default function CatalogoPage() {
  const products = useApi<Product[]>('/catalog/products?all=true');
  const additions = useApi<Addition[]>('/catalog/additions?all=true');

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-lg font-semibold">Catálogo · productos</h1>
        {products.loading && <p className="text-neutral-500">Cargando…</p>}
        {products.error && <p className="text-sm text-red-700">{products.error}</p>}
        <div className="space-y-3">
          {products.data?.map((p) => (
            <ProductCard key={p.id} product={p} onChange={products.reload} />
          ))}
        </div>
        <NewProduct onCreated={products.reload} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Adiciones</h2>
        <div className="space-y-2">
          {additions.data?.map((a) => (
            <AdditionRow key={a.id} addition={a} onChange={additions.reload} />
          ))}
        </div>
        <NewAddition onCreated={additions.reload} />
      </section>
    </div>
  );
}

function ProductCard({ product, onChange }: { product: Product; onChange: () => void }) {
  async function toggle(active: boolean) {
    await api(`/catalog/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    onChange();
  }
  async function toggleSeasonal(isSeasonal: boolean) {
    await api(`/catalog/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ isSeasonal }) });
    onChange();
  }
  return (
    <div className={`rounded-xl bg-white p-4 ring-1 ring-neutral-200 ${product.active ? '' : 'opacity-60'}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-medium">{product.name}</span>
          {product.category && <span className="ml-2 text-xs text-neutral-400">{product.category}</span>}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 text-neutral-600">
            <input type="checkbox" checked={product.isSeasonal} onChange={(e) => toggleSeasonal(e.target.checked)} />
            Temporada
          </label>
          <label className="flex items-center gap-1.5 text-neutral-600">
            <input type="checkbox" checked={product.active} onChange={(e) => toggle(e.target.checked)} />
            Activo
          </label>
        </div>
      </div>
      <div className="space-y-2">
        {product.variants.map((v) => (
          <VariantRow key={v.id} variant={v} onChange={onChange} />
        ))}
      </div>
      <NewVariant productId={product.id} onCreated={onChange} />
    </div>
  );
}

function VariantRow({ variant, onChange }: { variant: Variant; onChange: () => void }) {
  const [price, setPrice] = useState(variant.priceCop);
  const [wholesale, setWholesale] = useState(variant.wholesalePriceCop ?? 0);
  const [load, setLoad] = useState(variant.capacityLoad);
  const [busy, setBusy] = useState(false);
  const dirty =
    price !== variant.priceCop ||
    wholesale !== (variant.wholesalePriceCop ?? 0) ||
    load !== variant.capacityLoad;
  async function save() {
    setBusy(true);
    try {
      await api(`/catalog/variants/${variant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ priceCop: price, wholesalePriceCop: wholesale || null, capacityLoad: load }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function toggle(active: boolean) {
    await api(`/catalog/variants/${variant.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    onChange();
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-28 text-neutral-700">{variant.name}</span>
      <label className="flex items-center gap-1 text-xs text-neutral-400" title="Precio al cliente final">
        cliente
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className={`w-24 ${field}`}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-neutral-400" title="Precio a vendedor / mayorista">
        vendedor
        <input
          type="number"
          value={wholesale || ''}
          placeholder="—"
          onChange={(e) => setWholesale(Number(e.target.value))}
          className={`w-24 ${field}`}
        />
      </label>
      <label
        className="flex items-center gap-1 text-xs text-neutral-400"
        title="Carga en 'tortas grandes': cuánto ocupa en la moto/carro (grande = 1, mediana ≈ 0.5)"
      >
        carga
        <input
          type="number"
          min={0.1}
          step={0.5}
          value={load}
          onChange={(e) => setLoad(Number(e.target.value))}
          className={`w-16 ${field}`}
        />
      </label>
      <button onClick={save} disabled={busy || !dirty} className={btn}>
        Guardar
      </button>
      <label className="ml-auto flex items-center gap-1.5 text-neutral-500">
        <input type="checkbox" checked={variant.active} onChange={(e) => toggle(e.target.checked)} />
        Activo
      </label>
    </div>
  );
}

function NewVariant({ productId, onCreated }: { productId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [wholesale, setWholesale] = useState(0);
  const [load, setLoad] = useState(1);
  async function add() {
    await api(`/catalog/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        priceCop: price,
        wholesalePriceCop: wholesale || undefined,
        capacityLoad: load,
      }),
    });
    setName('');
    setPrice(0);
    setWholesale(0);
    setLoad(1);
    onCreated();
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input placeholder="Nuevo tamaño" value={name} onChange={(e) => setName(e.target.value)} className={`w-28 ${field}`} />
      <input
        type="number"
        placeholder="Precio cliente"
        value={price || ''}
        onChange={(e) => setPrice(Number(e.target.value))}
        className={`w-28 ${field}`}
      />
      <input
        type="number"
        placeholder="Precio vendedor"
        value={wholesale || ''}
        onChange={(e) => setWholesale(Number(e.target.value))}
        className={`w-28 ${field}`}
      />
      <label
        className="flex items-center gap-1 text-xs text-neutral-400"
        title="En 'tortas grandes': grande = 1, mediana ≈ 0.5"
      >
        carga
        <input
          type="number"
          min={0.1}
          step={0.5}
          value={load}
          onChange={(e) => setLoad(Number(e.target.value))}
          className={`w-16 ${field}`}
        />
      </label>
      <button onClick={add} disabled={!name || !price} className={btn}>
        + Tamaño
      </button>
    </div>
  );
}

function NewProduct({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [variantName, setVariantName] = useState('');
  const [price, setPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await api('/catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category: category || undefined,
          variants: [{ name: variantName, priceCop: price }],
        }),
      });
      setName('');
      setCategory('');
      setVariantName('');
      setPrice(0);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-4">
      <p className="mb-2 text-sm font-medium text-neutral-600">Nuevo producto</p>
      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <input placeholder="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} className={field} />
        <input placeholder="Primer tamaño" value={variantName} onChange={(e) => setVariantName(e.target.value)} className={`w-32 ${field}`} />
        <input type="number" placeholder="Precio" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} className={`w-32 ${field}`} />
        <button onClick={add} disabled={!name || !variantName || !price} className={btn}>
          Crear
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function AdditionRow({ addition, onChange }: { addition: Addition; onChange: () => void }) {
  const [price, setPrice] = useState(addition.priceCop);
  async function save() {
    await api(`/catalog/additions/${addition.id}`, { method: 'PATCH', body: JSON.stringify({ priceCop: price }) });
    onChange();
  }
  async function toggle(active: boolean) {
    await api(`/catalog/additions/${addition.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    onChange();
  }
  return (
    <div className={`flex items-center gap-2 rounded-lg bg-white p-3 text-sm ring-1 ring-neutral-200 ${addition.active ? '' : 'opacity-60'}`}>
      <span className="w-48 font-medium">{addition.name}</span>
      <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className={`w-32 ${field}`} />
      <button onClick={save} disabled={price === addition.priceCop} className={btn}>
        Guardar
      </button>
      <label className="ml-auto flex items-center gap-1.5 text-neutral-500">
        <input type="checkbox" checked={addition.active} onChange={(e) => toggle(e.target.checked)} />
        Activo
      </label>
    </div>
  );
}

function NewAddition({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  async function add() {
    await api('/catalog/additions', { method: 'POST', body: JSON.stringify({ name, priceCop: price }) });
    setName('');
    setPrice(0);
    onCreated();
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <input placeholder="Nueva adición" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      <input type="number" placeholder="Precio" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} className={`w-32 ${field}`} />
      <button onClick={add} disabled={!name || !price} className={btn}>
        + Adición
      </button>
    </div>
  );
}
