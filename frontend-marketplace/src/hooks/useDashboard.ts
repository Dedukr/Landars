"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAdminDashboard } from "@/lib/admin/dashboard";
import type { DashboardData, DashboardPeriod } from "@/lib/admin/dashboard";

// ─── Return shape ─────────────────────────────────────────────────────────────

export interface UseDashboardReturn {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  /** Re-trigger the fetch without changing the period. */
  refetch: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches admin dashboard data for the given period.
 *
 * Design notes:
 *  • Uses the project-standard useEffect + useState pattern (no external
 *    library), consistent with useOrders and the rest of the hooks folder.
 *  • A ref-based cancellation flag prevents state updates on unmounted
 *    components and on stale requests when `period` changes quickly.
 *  • A `refetchCounter` state value lets callers trigger a refresh by
 *    calling `refetch()` without changing the period.
 *  • If TanStack Query is ever added to the project, replace the body of
 *    this hook with:
 *      return useQuery({ queryKey: ["admin-dashboard", period], queryFn: () => fetchAdminDashboard(period) });
 *    and update the return type — the component surface stays the same.
 */
export function useDashboard(period: DashboardPeriod): UseDashboardReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  // cancelledRef is reset on every effect invocation so a slow in-flight
  // request from the previous period never overwrites fresh data.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setIsLoading(true);
    setError(null);

    fetchAdminDashboard(period)
      .then((result) => {
        if (!cancelledRef.current) setData(result);
      })
      .catch(() => {
        if (!cancelledRef.current)
          setError("Could not load dashboard data. Please try again.");
      })
      .finally(() => {
        if (!cancelledRef.current) setIsLoading(false);
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [period, refetchCounter]);

  const refetch = useCallback(() => {
    setRefetchCounter((n) => n + 1);
  }, []);

  return { data, isLoading, error, refetch };
}
