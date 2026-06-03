/**
 * Dashboard type definitions — re-exported from lib/api/adminDashboard for
 * co-location with the dashboard components.  Import from here inside the
 * dashboard folder; import from @/lib/api/adminDashboard everywhere else.
 */
export type {
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

export { PERIOD_OPTIONS } from "@/lib/api/adminDashboard";
