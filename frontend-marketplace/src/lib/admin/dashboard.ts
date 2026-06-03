/**
 * Admin dashboard API client  (spec Section 7)
 * ─────────────────────────────────────────────
 * Exports fetchAdminDashboard() as the canonical fetch function for the
 * /api/admin/dashboard/ endpoint.
 *
 * WHY httpClient INSTEAD OF raw fetch
 * The spec example uses bare fetch + credentials:"include", which works for
 * session-cookie auth.  This project uses JWT stored in localStorage.
 * Using raw fetch here would skip:
 *   • Authorization: Bearer <token> header injection
 *   • Automatic token refresh on 401 (with request queue to avoid races)
 *   • CSRF token management
 *   • Retry logic on transient failures
 * httpClient already handles all of the above, so duplicating that logic
 * would be wrong.  See src/utils/httpClient.ts for the implementation.
 */

import { httpClient } from "@/utils/httpClient";

// Re-export all types so callers need only one import.
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
} from "@/lib/api/adminDashboard";

export { PERIOD_OPTIONS } from "@/lib/api/adminDashboard";

// ─── API function ─────────────────────────────────────────────────────────────

import type { DashboardData, DashboardPeriod } from "@/lib/api/adminDashboard";

/**
 * Fetch admin dashboard data for the given time period.
 *
 * @param period - One of "7d" | "30d" | "90d" | "this_month"  (default "30d")
 * @throws Error when the request fails or the server returns a non-2xx status
 */
export async function fetchAdminDashboard(
  period: DashboardPeriod = "30d"
): Promise<DashboardData> {
  return httpClient.get<DashboardData>(
    `/api/admin/dashboard/?period=${period}`
  );
}
