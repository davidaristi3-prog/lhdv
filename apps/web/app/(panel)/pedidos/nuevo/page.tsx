'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { DELIVERY_LABEL } from '@/lib/labels';
import type { Addition, DeliveryType, Order, Product } from '@/lib/types';

interface DraftItem {
  productId: string;
  variantId: string;
  quantity: number;
  customText: string;
  additionIds: string[];
}

const emptyItem: DraftItem = { productId: '', variantId: '', quantity: 1, customText: '', additionIds: [] };

export default function NuevoPedidoPage() {
  const router = useRouter();
  const { data: products } = useApi<Product[]>('/catalog/products');
  const { data: additions } = useApi<Addition[]>('/catalog/additions');

  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ ...emptyItem }]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('PICKUP');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [notes, setNotes] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const variantById = useMemo(() => {
    const m = new Map<string, { priceCop: number }>();
    products?.forEach((p) => p.variants.forEach((v) => m.set(v.id, v)));
    return m;
  }, [products]);
  const additionById = useMemo(() => {
    const m = new Map<string, Addition>();
    additions?.forEach((a) => m.set(a.id, a));
    return m;
  }, [additions]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => {
      const v = variantById.get(it.variantId);
      const adds = it.additionIds.reduce((s, id) => s + (additionById.get(id)?.priceCop ?? 0), 0);
      return sum + (v ? v.priceCop * it.quantity + adds : 0);
    }, 0);
  }, [items, variantById, additionById]);
  const total = subtotal + Number(deliveryCost || 0);

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function toggleAddition(i: number, id: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i
          ? {
              ...it,
              additionIds: it.additionIds.includes(id)
                ? it.additionIds.filter((x) => x !== id)
                : [...it.additionIds, id],
            }
          : it,
      ),
    );
  }

  async function submit() {
    setError(null);
    if (!customerPhone) return setError('Indicá el WhatsApp del cliente');
    if (items.some((it) => !it.variantId)) return setError('Cada renglón necesita un producto y tamaño');

    setBusy(true);
    try {
      const order = await api<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerPhone,
          customerName: customerName || undefined,
          channel: 'MANUAL',
          isCustom,
          deliveryType,
          deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
          deliveryAddress: deliveryAddress || undefined,
          deliveryCostCop: Number(deliveryCost || 0),
          notes: notes || undefined,
          items: items.map((it) => ({
            productVariantId: it.variantId,
            quantity: it.quantity,
            customText: it.customText || undefined,
            additions: it.additionIds.map((additionId) => ({ additionId })),
          })),
        }),
      });
      router.push(`/pedidos/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
  const card = 'rounded-xl bg-white p-5 ring-1 ring-neutral-200';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-lg font-semibold">Nuevo pedido</h1>

      <div className="space-y-5">
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Cliente</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="WhatsApp (+57…)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className={field}
            />
            <input
              placeholder="Nombre (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">Productos</h2>
            <button
              onClick={() => setItems((p) => [...p, { ...emptyItem }])}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              + Agregar renglón
            </button>
          </div>
          <div className="space-y-4">
            {items.map((it, i) => {
              const product = products?.find((p) => p.id === it.productId);
              return (
                <div key={i} className="rounded-lg border border-neutral-200 p-3">
                  <div className="grid grid-cols-12 gap-2">
                    <select
                      value={it.productId}
                      onChange={(e) => updateItem(i, { productId: e.target.value, variantId: '' })}
                      className={`col-span-5 ${field}`}
                    >
                      <option value="">Producto…</option>
                      {products?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={it.variantId}
                      onChange={(e) => updateItem(i, { variantId: e.target.value })}
                      className={`col-span-4 ${field}`}
                      disabled={!product}
                    >
                      <option value="">Tamaño…</option>
                      {product?.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {formatCop(v.priceCop)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value)) })}
                      className={`col-span-2 ${field}`}
                    />
                    <button
                      onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                      disabled={items.length === 1}
                      className="col-span-1 rounded-lg text-neutral-400 hover:text-red-600 disabled:opacity-30"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    placeholder="Texto / diseño (ej. Feliz cumpleaños)"
                    value={it.customText}
                    onChange={(e) => updateItem(i, { customText: e.target.value })}
                    className={`mt-2 ${field}`}
                  />
                  {additions && additions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {additions.map((a) => (
                        <label key={a.id} className="flex items-center gap-1.5 text-sm text-neutral-600">
                          <input
                            type="checkbox"
                            checked={it.additionIds.includes(a.id)}
                            onChange={() => toggleAddition(i, a.id)}
                          />
                          {a.name} ({formatCop(a.priceCop)})
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Entrega</h2>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value as DeliveryType)}
              className={field}
            >
              {(Object.keys(DELIVERY_LABEL) as DeliveryType[]).map((d) => (
                <option key={d} value={d}>
                  {DELIVERY_LABEL[d]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={field}
            />
            {deliveryType !== 'PICKUP' && (
              <>
                <input
                  placeholder="Dirección"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className={`col-span-2 ${field}`}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Costo del domicilio"
                  value={deliveryCost || ''}
                  onChange={(e) => setDeliveryCost(Number(e.target.value))}
                  className={field}
                />
              </>
            )}
          </div>
          <textarea
            placeholder="Notas del pedido"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`mt-3 ${field}`}
            rows={2}
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={isCustom} onChange={(e) => setIsCustom(e.target.checked)} />
            Pedido personalizado (requiere revisión)
          </label>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center justify-between rounded-xl bg-white p-5 ring-1 ring-neutral-200">
          <div>
            <p className="text-sm text-neutral-500">Total</p>
            <p className="text-2xl font-semibold">{formatCop(total)}</p>
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? 'Creando…' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}
