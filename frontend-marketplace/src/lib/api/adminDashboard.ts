/**
 * Admin dashboard API helper.
 * Single canonical source for all dashboard types and fetch functions.
 *
 * Naming follows the Phase 3 spec (Section 6):
 *   DashboardKpis, SalesChartPoint, StatusBreakdownItem, DashboardAlertItem
 *
 * Old names are exported as type aliases at the bottom for backward compat.
 */

import { httpClient } from "@/utils/httpClient";

// ─── Period ──────────────────────────────────────────────────────────────────

export type DashboardPeriod = "7d" | "30d" | "90d" | "this_month";

export const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
];

// ─── KPIs ────────────────────────────────────────────────────────────────────

export type DashboardKpis = {
  today_revenue: string;
  today_orders: number;
  pending_orders: number;
  paid_orders: number;
  average_order_value: string;
  unmatched_transactions: number;
  failed_shipments: number;
  failed_notifications: number;
  // Always present from the backend — optional here to be safe if the module
  // is not yet installed.
  invoices_issued_this_month?: number;
  credit_notes_this_month?: number;
  top_product_sold_quantity?: number;
  // Period-level totals
  revenue: string;
  orders_count: number;
  new_customers: number;
  completed_orders: number;
  total_products: number;
  active_products: number;
  total_customers: number;
};

// ─── Charts ──────────────────────────────────────────────────────────────────

export type SalesChartPoint = {
  date: string;
  revenue: string;
  orders: number;
};

// ─── Breakdowns ──────────────────────────────────────────────────────────────

export type StatusBreakdownItem = {
  status: string;
  count: number;
};

// ─── Products ────────────────────────────────────────────────────────────────

export type TopProduct = {
  id: number;
  name: string;
  /** Unit count returned as a number from the backend aggregation. */
  sold_quantity: number;
  sold_orders_count: number;
  /** Revenue is optional — not present in all API versions. */
  revenue?: string;
};

// ─── Recent orders ───────────────────────────────────────────────────────────

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

// ─── Alerts ──────────────────────────────────────────────────────────────────

/**
 * Unified alert item type.  All fields are optional except `id` because each
 * alert type (shipment / transaction / notification) populates a different
 * subset of fields.
 */
export type DashboardAlertItem = {
  id: number;
  order_id?: number;
  reference?: string;
  amount?: string;
  /** Bank statement date — populated on unmatched transactions. */
  statement_date?: string;
  status?: string;
  message?: string;
  error?: string;
  event?: string;
  created_at?: string | null;
};

export type DashboardAlerts = {
  failed_shipments: DashboardAlertItem[];
  unmatched_transactions: DashboardAlertItem[];
  failed_notifications: DashboardAlertItem[];
  /** Future: orders without a matching invoice. */
  orders_needing_invoice?: DashboardAlertItem[];
};

// ─── Full response ────────────────────────────────────────────────────────────

export type DashboardData = {
  period: DashboardPeriod;
  period_start: string;
  period_end: string;
  kpis: DashboardKpis;
  sales_chart: SalesChartPoint[];
  recent_orders: RecentOrder[];
  order_status_breakdown: StatusBreakdownItem[];
  orders_by_source: StatusBreakdownItem[];
  invoice_status_breakdown: StatusBreakdownItem[];
  shipment_status_breakdown: StatusBreakdownItem[];
  reconciliation_breakdown: StatusBreakdownItem[];
  top_products: TopProduct[];
  alerts: DashboardAlerts;
};

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function getDashboardData(
  period: DashboardPeriod = "30d"
): Promise<DashboardData> {
  return httpClient.get<DashboardData>(
    `/api/admin/dashboard/?period=${period}`
  );
}

/**
 * Spec Section 7 canonical name — delegates to getDashboardData.
 * Prefer this name in new code; getDashboardData is kept for compatibility.
 */
export const fetchAdminDashboard = getDashboardData;

// ─── Backward-compat aliases (old PascalCase / Entry names) ──────────────────

/** @deprecated Use DashboardKpis */
export type DashboardKPIs = DashboardKpis;
/** @deprecated Use SalesChartPoint */
export type SalesChartEntry = SalesChartPoint;
/** @deprecated Use StatusBreakdownItem */
export type StatusBreakdownEntry = StatusBreakdownItem;
/** @deprecated Use DashboardAlertItem */
export type AlertShipment = DashboardAlertItem;
/** @deprecated Use DashboardAlertItem */
export type AlertTransaction = DashboardAlertItem;
/** @deprecated Use DashboardAlertItem */
export type AlertNotification = DashboardAlertItem;
