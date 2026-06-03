/**
 * Dashboard type definitions — co-located with components for easy import
 * within the dashboard folder.  The canonical source is lib/api/adminDashboard.
 *
 * Import from here inside dashboard components; import from
 * @/lib/api/adminDashboard everywhere else.
 */
export type {
  DashboardAlertItem,
  DashboardAlerts,
  DashboardData,
  DashboardKpis,
  DashboardPeriod,
  RecentOrder,
  SalesChartPoint,
  StatusBreakdownItem,
  TopProduct,
  // backward-compat aliases
  DashboardKPIs,
  SalesChartEntry,
  StatusBreakdownEntry,
  AlertShipment,
  AlertTransaction,
  AlertNotification,
} from "@/lib/api/adminDashboard";

export { PERIOD_OPTIONS } from "@/lib/api/adminDashboard";
