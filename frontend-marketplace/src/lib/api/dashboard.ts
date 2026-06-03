import { httpClient } from "@/utils/httpClient";

// ─── Legacy summary (used by /api/dashboard/summary/) ────────────────────────

export type DashboardSummary = {
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_products: number;
  active_products: number;
  total_customers: number;
  total_shipments: number;
  unreconciled_bank_transactions: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return httpClient.get<DashboardSummary>("/api/dashboard/summary/");
}

// ─── Phase 3 dashboard types ──────────────────────────────────────────────────

export type DashboardPeriod = "7d" | "30d" | "90d" | "this_month";

export const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
];

export type DashboardKPIs = {
  revenue: string;
  orders_count: number;
  paid_orders: number;
  new_customers: number;
  average_order_value: string;
  pending_orders: number;
  completed_orders: number;
  total_products: number;
  active_products: number;
  total_customers: number;
  today_revenue: string;
  today_orders: number;
  unmatched_transactions: number;
  failed_shipments: number;
  failed_notifications: number;
  invoices_issued_this_month: number;
  credit_notes_this_month: number;
  top_product_sold_quantity: number;
};

export type SalesChartEntry = {
  date: string;
  revenue: string;
  orders: number;
};

export type StatusBreakdownEntry = {
  status: string;
  count: number;
};

export type TopProduct = {
  id: number;
  name: string;
  sold_quantity: string;
  sold_orders_count: number;
  revenue: string;
};

export type RecentOrder = {
  id: number;
  reference: string;
  customer_name: string;
  total: string;
  status: string;
  payment_status?: string;
  source?: string;
  created_at: string | null;
  delivery_date?: string | null;
};

export type AlertShipment = {
  id: number;
  order_id: number;
  status: string;
  message: string;
  created_at: string | null;
};

export type AlertTransaction = {
  id: number;
  amount: string;
  reference: string;
  statement_date: string;
  created_at: string | null;
};

export type AlertNotification = {
  id: number;
  order_id: number;
  event: string;
  error: string;
  created_at: string | null;
};

export type DashboardAlerts = {
  failed_shipments: AlertShipment[];
  unmatched_transactions: AlertTransaction[];
  failed_notifications: AlertNotification[];
};

export type DashboardData = {
  period: DashboardPeriod;
  period_start: string;
  period_end: string;
  kpis: DashboardKPIs;
  sales_chart: SalesChartEntry[];
  recent_orders: RecentOrder[];
  order_status_breakdown: StatusBreakdownEntry[];
  orders_by_source: StatusBreakdownEntry[];
  invoice_status_breakdown: StatusBreakdownEntry[];
  shipment_status_breakdown: StatusBreakdownEntry[];
  reconciliation_breakdown: StatusBreakdownEntry[];
  top_products: TopProduct[];
  alerts: DashboardAlerts;
};

export async function getDashboardData(
  period: DashboardPeriod = "30d"
): Promise<DashboardData> {
  return httpClient.get<DashboardData>(
    `/api/admin/dashboard/?period=${period}`
  );
}
