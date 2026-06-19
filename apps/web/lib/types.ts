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
}
