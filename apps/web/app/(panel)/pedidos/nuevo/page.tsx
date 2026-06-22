'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCop } from '@lhdv/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { useAuth } from '@/lib/auth';
import { detectZone } from '@/lib/zones';
import { DELIVERY_LABEL } from '@/lib/labels';
import type {
  Addition,
  Customer,
  CustomerAddress,
  DeliveryType,
  DeliveryZone,
  Order,
  Product,
} from '@/lib/types';

interface DraftItem {
  productId: string;
  variantId: string;
  quantity: number | ''; // '' = vacío momentáneo mientras se edita; al salir del campo vuelve a 1
  customText: string;
  additionIds: string[];
}

const emptyItem: DraftItem = { productId: '', variantId: '', quantity: 1, customText: '', additionIds: [] };
const NEW_ADDRESS = '__new__';

function NuevoPedidoInner() {
  const router = useRouter();
  const editId = useSearchParams().get('id');
  const { user } = useAuth();
  const { data: products } = useApi<Product[]>('/catalog/products');
  const { data: additions } = useApi<Addition[]>('/catalog/additions');
  const { data: zones } = useApi<DeliveryZone[]>('/delivery-zones');

  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerFound, setCustomerFound] = useState<boolean | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(NEW_ADDRESS);

  const [items, setItems] = useState<DraftItem[]>([{ ...emptyItem }]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('PICKUP');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressLabel, setAddressLabel] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [zoneAuto, setZoneAuto] = useState(false);
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [notes, setNotes] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [generarCuenta, setGenerarCuenta] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'draft' | 'cocina' | null>(null);
  const [pendingZoneName, setPendingZoneName] = useState<string | null>(null);
  const preloaded = useRef(false);

  // El rol Domicilios no puede crear pedidos: si entra por URL, lo devolvemos.
  useEffect(() => {
    if (user && user.role === 'DELIVERY') router.replace('/pedidos');
  }, [user, router]);

  // Edición de borrador: precargar el pedido una sola vez.
  useEffect(() => {
    if (!editId || preloaded.current) return;
    preloaded.current = true;
    void (async () => {
      try {
        const o = await api<Order>(`/orders/${editId}`);
        setCustomerPhone(o.customer.whatsappPhone);
        setCustomerName(o.customer.name ?? '');
        if (o.items.length) {
          setItems(
            o.items.map((it) => ({
              productId: it.variant.product.id,
              variantId: it.variant.id,
              quantity: it.quantity,
              customText: it.customText ?? '',
              additionIds: it.additions?.map((a) => a.addition.id) ?? [],
            })),
          );
        }
        if (o.deliveryType) setDeliveryType(o.deliveryType);
        if (o.deliveryDate) setDeliveryDate(o.deliveryDate.slice(0, 10));
        if (o.deliveryAddress) setDeliveryAddress(o.deliveryAddress);
        if (o.customerAddressId) setSelectedAddressId(o.customerAddressId);
        if (o.deliveryCostCop) setDeliveryCost(o.deliveryCostCop);
        if (o.notes) setNotes(o.notes);
        setIsCustom(o.isCustom);
        setPendingZoneName(o.deliveryZone ?? null);
        const found = await api<Customer | undefined>(
          `/customers/lookup?phone=${encodeURIComponent(o.customer.whatsappPhone)}`,
        );
        if (found?.addresses?.length) setAddresses(found.addresses);
        if (found?.taxId) setTaxId(found.taxId);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapear la zona guardada del borrador cuando el catálogo de zonas ya esté.
  useEffect(() => {
    if (!pendingZoneName || !zones) return;
    const z = zones.find((x) => x.name === pendingZoneName);
    if (z) setSelectedZoneId(z.id);
    setPendingZoneName(null);
  }, [pendingZoneName, zones]);

  // Fechas rápidas para la entrega (formato YYYY-MM-DD del input date).
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = dateStr(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = dateStr(tomorrowDate);

  // ─── Zona ───────────────────────────────────────────────────
  function setZone(id: string, auto: boolean) {
    setSelectedZoneId(id);
    setZoneAuto(auto);
    const z = zones?.find((x) => x.id === id);
    if (z) setDeliveryCost(z.deliveryCostCop);
  }
  function autodetectZone(text: string) {
    if (!zones) return;
    const z = detectZone(text, zones);
    if (z) setZone(z.id, true);
  }

  // ─── Cliente ────────────────────────────────────────────────
  async function lookupCustomer() {
    if (!customerPhone.trim()) return;
    try {
      const found = await api<Customer | undefined>(
        `/customers/lookup?phone=${encodeURIComponent(customerPhone.trim())}`,
      );
      if (found) {
        setCustomerFound(true);
        setCustomerName((n) => n || found.name || '');
        if (found.taxId) setTaxId((t) => t || found.taxId || '');
        const addrs = found.addresses ?? [];
        setAddresses(addrs);
        if (addrs.length > 0) {
          setSelectedAddressId(addrs[0].id);
          autodetectZone(addrs[0].zone || addrs[0].address);
        } else {
          setSelectedAddressId(NEW_ADDRESS);
        }
      } else {
        setCustomerFound(false);
        setAddresses([]);
        setSelectedAddressId(NEW_ADDRESS);
      }
    } catch {
      /* silencioso */
    }
  }

  function selectSavedAddress(id: string) {
    setSelectedAddressId(id);
    if (id !== NEW_ADDRESS) {
      const a = addresses.find((x) => x.id === id);
      if (a) autodetectZone(a.zone || a.address);
    }
  }

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
      return sum + (v ? v.priceCop * (it.quantity || 1) + adds : 0);
    }, 0);
  }, [items, variantById, additionById]);

  const isPickup = deliveryType === 'PICKUP';
  const total = subtotal + (isPickup ? 0 : Number(deliveryCost || 0));
  const selectedZone = zones?.find((z) => z.id === selectedZoneId);

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

  async function submit(confirm: boolean, freeReason?: 'GIFT' | 'WARRANTY') {
    setError(null);
    if (!customerPhone) return setError('Indicá el WhatsApp del cliente');
    // Solo cuentan los renglones con producto y tamaño; un borrador puede ir sin productos.
    const validItems = items.filter((it) => it.variantId);
    if (confirm && validItems.length === 0) {
      return setError('Para enviar a cocina agregá al menos un producto');
    }
    if (generarCuenta && !taxId.trim()) {
      return setError('Para la cuenta de cobro indicá el CC o NIT del cliente');
    }

    const usingSaved = !isPickup && selectedAddressId !== '' && selectedAddressId !== NEW_ADDRESS;
    const deliveryFields = isPickup
      ? {}
      : {
          deliveryZone: selectedZone?.name,
          deliveryCostCop: Number(deliveryCost || 0),
          ...(usingSaved
            ? { customerAddressId: selectedAddressId }
            : {
                deliveryAddress: deliveryAddress || undefined,
                addressLabel: addressLabel || undefined,
                saveAddress,
              }),
        };

    setSubmitting(confirm ? 'cocina' : 'draft');
    const payload = {
      customerPhone,
      customerName: customerName || undefined,
      channel: 'MANUAL',
      isCustom,
      confirm,
      freeReason,
      taxId: generarCuenta ? taxId.trim() : undefined,
      deliveryType,
      deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
      notes: notes || undefined,
      ...deliveryFields,
      items: validItems.map((it) => ({
        productVariantId: it.variantId,
        quantity: Number(it.quantity) || 1,
        customText: it.customText || undefined,
        additions: it.additionIds.map((additionId) => ({ additionId })),
      })),
    };
    try {
      let orderId: string;
      if (editId) {
        // Guardar los cambios del borrador; si se pidió, enviarlo a cocina.
        await api<Order>(`/orders/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        if (confirm) await api(`/orders/${editId}/confirm`, { method: 'POST' });
        orderId = editId;
      } else {
        const order = await api<Order>('/orders', { method: 'POST', body: JSON.stringify(payload) });
        orderId = order.id;
      }
      // Si se pidió cuenta de cobro, se genera y se abre lista para imprimir.
      if (generarCuenta) {
        const invoice = await api<{ id: string }>(`/invoices/from-order/${orderId}`, { method: 'POST' });
        router.push(`/cuentas-cobro/${invoice.id}`);
      } else if (editId) {
        router.push(confirm ? '/cocina' : '/pedidos');
      } else {
        router.push(confirm ? '/cocina' : `/pedidos/${orderId}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(null);
    }
  }

  const field = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
  const card = 'rounded-xl bg-white p-5 ring-1 ring-neutral-200';
  const showNewAddress = selectedAddressId === NEW_ADDRESS || addresses.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-lg font-semibold">{editId ? 'Editar borrador' : 'Nuevo pedido'}</h1>

      <div className="space-y-5">
        {/* 1 · Cliente */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">1 · Cliente</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="WhatsApp (+57…)"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setCustomerFound(null);
              }}
              onBlur={lookupCustomer}
              className={field}
            />
            <input
              placeholder="Nombre (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={field}
            />
          </div>
          {customerFound === true && (
            <p className="mt-2 text-xs text-emerald-600">
              ✓ Cliente registrado{addresses.length > 0 ? ` · ${addresses.length} dirección(es)` : ''}
            </p>
          )}
          {customerFound === false && (
            <p className="mt-2 text-xs text-neutral-400">Cliente nuevo — se creará con este pedido.</p>
          )}
        </div>

        {/* 2 · Entrega */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">2 · Entrega</h2>
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
            <div>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={`w-full ${field}`}
              />
              <div className="mt-1 flex gap-1">
                {[
                  { label: 'Hoy', value: todayStr },
                  { label: 'Mañana', value: tomorrowStr },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setDeliveryDate(q.value)}
                    className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium ${
                      deliveryDate === q.value
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {!isPickup && (
              <>
                {addresses.length > 0 && (
                  <select
                    value={selectedAddressId}
                    onChange={(e) => selectSavedAddress(e.target.value)}
                    className={`col-span-2 ${field}`}
                  >
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label ? `${a.label} — ` : ''}
                        {a.address}
                      </option>
                    ))}
                    <option value={NEW_ADDRESS}>➕ Nueva dirección…</option>
                  </select>
                )}

                {showNewAddress && (
                  <>
                    <input
                      placeholder="Nueva dirección"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      onBlur={() => autodetectZone(`${deliveryAddress} ${addressLabel}`)}
                      className={`col-span-2 ${field}`}
                    />
                    <input
                      placeholder="Etiqueta (Casa, Trabajo… o la ciudad)"
                      value={addressLabel}
                      onChange={(e) => setAddressLabel(e.target.value)}
                      onBlur={() => autodetectZone(`${deliveryAddress} ${addressLabel}`)}
                      className={field}
                    />
                    <label className="flex items-center gap-2 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                      />
                      Guardar esta dirección
                    </label>
                  </>
                )}

                {/* Zona de domicilio */}
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-neutral-500">
                    Zona de domicilio
                    {zoneAuto && selectedZone && (
                      <span className="ml-1 text-emerald-600">· detectada automáticamente</span>
                    )}
                  </label>
                  <select
                    value={selectedZoneId}
                    onChange={(e) => setZone(e.target.value, false)}
                    className={field}
                  >
                    <option value="">Elegí la zona…</option>
                    {zones?.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} — {formatCop(z.deliveryCostCop)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3 · Productos */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">3 · Productos</h2>
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
                      onChange={(e) => {
                        const v = e.target.value;
                        updateItem(i, { quantity: v === '' ? '' : Math.max(1, Number(v)) });
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || Number(e.target.value) < 1) updateItem(i, { quantity: 1 });
                      }}
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
          <button
            onClick={() => setItems((p) => [...p, { ...emptyItem }])}
            className="mt-3 w-full rounded-lg border border-dashed border-neutral-300 py-2 text-sm font-medium text-blue-700 hover:bg-neutral-50"
          >
            + Agregar otro producto
          </button>
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={isCustom} onChange={(e) => setIsCustom(e.target.checked)} />
            Pedido personalizado (requiere revisión)
          </label>
        </div>

        {/* 4 · Costo de domicilio */}
        {!isPickup && (
          <div className={card}>
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">4 · Costo de domicilio</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={0}
                value={deliveryCost || ''}
                onChange={(e) => {
                  setDeliveryCost(Number(e.target.value));
                  setZoneAuto(false);
                }}
                className={`w-40 ${field}`}
              />
              {selectedZone && (
                <span className="text-sm text-neutral-500">
                  Zona <b>{selectedZone.name}</b> · sugerido {formatCop(selectedZone.deliveryCostCop)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Se autocompleta según la zona detectada; podés ajustarlo.
            </p>
          </div>
        )}

        {/* 5 · Total */}
        <div className={card}>
          <textarea
            placeholder="Notas del pedido"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`mb-4 ${field}`}
            rows={2}
          />
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {/* Cuenta de cobro: opcional, al final del pedido. */}
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={generarCuenta}
              onChange={(e) => setGenerarCuenta(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="font-medium text-neutral-700">🧾 Generar cuenta de cobro</span>
          </label>
          {generarCuenta && (
            <div className="mb-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">
                  CC o NIT del cliente <span className="text-red-500">*</span>
                </span>
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="Ej: 890.982.479-6"
                  className={field}
                />
              </label>
              <p className="mt-2 text-xs text-neutral-500">
                Al crear el pedido se abre la cuenta de cobro lista para imprimir. La dirección y el
                teléfono salen del pedido y del cliente.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-neutral-500">5 · Total</p>
              <p className="text-2xl font-semibold">{formatCop(total)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => submit(false)}
                  disabled={submitting !== null}
                  className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                >
                  {submitting === 'draft' ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar borrador'}
                </button>
                <button
                  onClick={() => submit(true)}
                  disabled={submitting !== null}
                  className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {submitting === 'cocina' ? 'Enviando…' : editId ? 'Enviar a cocina' : 'Crear y enviar a cocina'}
                </button>
              </div>
              {/* Sin cobro: mueve inventario igual, pero total $0 y no cuenta como ingreso. */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400">Sin cobro:</span>
                <button
                  onClick={() => submit(true, 'GIFT')}
                  disabled={submitting !== null}
                  className="rounded-lg border border-purple-200 px-3 py-1.5 font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                >
                  🎁 Regalo
                </button>
                <button
                  onClick={() => submit(true, 'WARRANTY')}
                  disabled={submitting !== null}
                  className="rounded-lg border border-purple-200 px-3 py-1.5 font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                >
                  🛠 Garantía
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NuevoPedidoPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-neutral-500">Cargando…</div>}>
      <NuevoPedidoInner />
    </Suspense>
  );
}
