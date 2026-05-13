/**
 * Order detail API shape (customer GET `/api/orders/:id/`).
 * Optional fields may be absent depending on serializer version.
 */

export interface OrderDetailCustomer {
  id: number;
  name: string;
  email: string;
}

export interface OrderDetailAddress {
  address_line?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
}

export interface OrderDetailItem {
  id: number;
  product?: {
    id: number;
    name: string;
    price: string;
    image_url?: string | null;
    description?: string;
  } | null;
  product_name?: string;
  product_price?: string;
  product_image_url?: string | null;
  quantity: number;
  get_total_price?: string;
  total_price?: string;
}

export interface MarketplaceOrderDetail {
  id: number;
  customer?: OrderDetailCustomer;
  /** Flattened fields from some serializers */
  customer_name?: string | null;
  /** From serializer when profile phone is available */
  customer_phone?: string | null;
  customer_address?: string | null;
  address?: OrderDetailAddress | null;
  notes: string;
  delivery_date: string;
  is_home_delivery: boolean;
  delivery_fee: string;
  discount: string;
  created_at: string;
  status: string;
  invoice_link: string;
  items: OrderDetailItem[];
  sum_price: string;
  total_price: string;
  total_items: number;
  total_weight?: string | null;
  payment_intent_id?: string;
  payment_status?: string;
  shipping_method_id?: number;
  shipping_carrier?: string;
  shipping_service_name?: string;
  shipping_cost?: string;
  shipping_tracking_number?: string;
  shipping_tracking_url?: string;
  shipping_label_url?: string;
  sendcloud_parcel_id?: number | string;
  /** Human-readable Sendcloud carrier status (e.g. "In transit", "Delivered") */
  shipment_status?: string;
  /** Legacy/alternate key used in some clients */
  shipping_status?: string;
  shipping_error_message?: string;
  /** ISO date string (YYYY-MM-DD) — estimated delivery date from Sendcloud/carrier */
  expected_delivery_date?: string | null;
  /** ISO datetime string — confirmed delivered timestamp from Sendcloud webhook */
  delivered_at?: string | null;
}
