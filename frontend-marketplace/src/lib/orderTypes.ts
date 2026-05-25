/** Customer order list item shape from GET `/api/orders/`. */

export interface OrderListItem {
  id: number;
  product: number;
  product_name: string;
  product_price: string;
  quantity: string;
  total_price: string;
}

export type OrderListStatus =
  | "pending"
  | "paid"
  | "ready_to_ship"
  | "issued"
  | "cancelled";

export interface OrderListEntry {
  id: number;
  customer: number;
  customer_name?: string;
  notes?: string;
  delivery_date: string | null;
  is_home_delivery: boolean;
  delivery_fee: string;
  discount: string;
  created_at: string;
  status: OrderListStatus | string;
  invoice_link?: string | null;
  items: OrderListItem[];
  total_price: string;
  total_items: number;
  shipment_status?: string | null;
}

export interface OrdersListResponse {
  results: OrderListEntry[];
  count: number;
  next: string | null;
  previous: string | null;
  limit: number;
  offset: number;
}

export type OrdersStatusFilter =
  | ""
  | "pending"
  | "paid"
  | "ready_to_ship"
  | "issued"
  | "cancelled";

export interface UseOrdersFilters {
  status: OrdersStatusFilter;
  dateFrom: string;
  dateTo: string;
  sort: string;
}

export const ORDER_SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-delivery_date", label: "Delivery date (latest)" },
  { value: "delivery_date", label: "Delivery date (earliest)" },
  { value: "-total_price", label: "Highest total" },
  { value: "total_price", label: "Lowest total" },
] as const;

export const ORDER_STATUS_CHIP_OPTIONS: {
  value: OrdersStatusFilter | "active";
  label: string;
}[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Confirmed" },
  { value: "ready_to_ship", label: "Ready to ship" },
  { value: "issued", label: "Issued" },
  { value: "cancelled", label: "Cancelled" },
];

export const ACTIVE_ORDER_STATUSES: OrderListStatus[] = [
  "pending",
  "paid",
  "ready_to_ship",
];
