import type { OrderStatus } from '@lhdv/shared';

export type Role = 'OWNER' | 'KITCHEN' | 'SALES' | 'DELIVERY';
export type Channel = 'WHATSAPP' | 'MANUAL' | 'RAPPI';
export type DeliveryType = 'PICKUP' | 'OWN_COURIER' | 'EXPRESS_APP';

export interface Variant {
  id: string;
  productId: string;
  name: string;
  priceCop: number;
  weightGrams: number | null;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isSeasonal: boolean;
  active: boolean;
  variants: Variant[];
}

export interface Addition {
  id: string;
  name: string;
  priceCop: number;
  active: boolean;
}

export interface CustomerLite {
  id: string;
  name: string | null;
  whatsappPhone: string;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string | null;
  address: string;
  zone: string | null;
  notes: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface DeliveryZone {
  id: string;
  name: string;
  deliveryCostCop: number;
  aliases: string[];
  active: boolean;
}

export interface OrderItemAddition {
  id: string;
  priceCop: number;
  quantity: number;
  addition: Addition;
}

export interface OrderItem {
  id: string;
  quantity: number;
  unitPriceCop: number;
  customText: string | null;
  notes: string | null;
  variant: Variant & { product: Product };
  additions?: OrderItemAddition[];
}

export interface StatusEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  code: string;
  status: OrderStatus;
  channel: Channel;
  isCustom: boolean;
  deliveryType: DeliveryType | null;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  deliveryZone: string | null;
  customerAddressId: string | null;
  customerAddress?: CustomerAddress | null;
  routeId?: string | null;
  routeSeq?: number | null;
  deliveredAt?: string | null;
  deliveryPhotoPath?: string | null;
  subtotalCop: number;
  totalCop: number;
  deliveryCostCop: number;
  notes: string | null;
  createdAt: string;
  customer: CustomerLite;
  items: OrderItem[];
  statusEvents?: StatusEvent[];
}

export interface Customer {
  id: string;
  name: string | null;
  whatsappPhone: string;
  notes: string | null;
  createdAt: string;
  _count?: { orders: number };
  orders?: Order[];
  addresses?: CustomerAddress[];
}

// ─── Contabilidad ─────────────────────────────────────────────

export type ExpenseCategory =
  | 'INGREDIENTS'
  | 'RENT'
  | 'PAYROLL'
  | 'UTILITIES'
  | 'DELIVERY'
  | 'PACKAGING'
  | 'MARKETING'
  | 'FEES'
  | 'OTHER';

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amountCop: number;
  notes: string | null;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnitCop: number;
  active: boolean;
}

export interface RecipeItem {
  id: string;
  ingredientId: string;
  quantity: number;
  ingredient: Ingredient;
}

export interface Recipe {
  variantId: string;
  items: RecipeItem[];
  costCop: number;
}

export interface Summary {
  ventas: number;
  ingresosCop: number;
  ticketPromedioCop: number;
  cogsCop: number;
  gastosCop: number;
  utilidadBrutaCop: number;
  utilidadNetaCop: number;
  margenBrutoPct: number;
  margenNetoPct: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  cantidad: number;
  ingresosCop: number;
}

export interface TopCustomer {
  customerId: string;
  name: string | null;
  phone: string;
  pedidos: number;
  totalCop: number;
}

export interface MonthSales {
  mes: number;
  ingresosCop: number;
  ventas: number;
}

export interface ExpenseByCategory {
  category: ExpenseCategory;
  totalCop: number;
}

// ─── Domicilios ───────────────────────────────────────────────

export type RouteStatus = 'DRAFT' | 'IN_PROGRESS' | 'DONE';

export interface DeliveryRoute {
  id: string;
  date: string;
  status: RouteStatus;
  courierId: string | null;
  courierLat: number | null;
  courierLng: number | null;
  courierAt: string | null;
  createdAt: string;
  courier?: { id: string; name: string } | null;
  orders: Order[];
  _count?: { orders: number };
}
