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

// ─── Phase 3+ admin dashboard — canonical source is lib/api/adminDashboard.ts ─
// Re-exported here for backward compatibility with existing imports.

export type {
  // New canonical names (spec Section 6)
  DashboardKpis,
  SalesChartPoint,
  StatusBreakdownItem,
  DashboardAlertItem,
  // Aliases kept for backward compat
  AlertNotification,
  AlertShipment,
  AlertTransaction,
  DashboardAlerts,
  DashboardData,
  DashboardKPIs,
  DashboardPeriod,
  RecentOrder,
  SalesChartEntry,
  StatusBreakdownEntry,
  TopProduct,
} from "@/lib/api/adminDashboard";

export { getDashboardData, PERIOD_OPTIONS } from "@/lib/api/adminDashboard";
