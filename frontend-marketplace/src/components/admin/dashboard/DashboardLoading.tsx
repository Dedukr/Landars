import { Loader2 } from "lucide-react";

/**
 * Dashboard-specific skeleton loading state.
 * Shown while the /api/admin/dashboard/ response is in flight.
 */
export function DashboardLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">Loading dashboard…</p>
    </div>
  );
}
