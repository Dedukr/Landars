import type { ReactNode } from "react";

import { AdminMetricCard } from "@/components/admin/ui/AdminMetricCard";

export type DashboardKpiCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: string;
  className?: string;
};

/**
 * Dashboard-scoped KPI card.
 * Thin wrapper around AdminMetricCard — use this inside dashboard components
 * so the dashboard folder is self-contained and future per-dashboard styling
 * can be applied without touching the shared design-system component.
 */
export function DashboardKpiCard(props: DashboardKpiCardProps) {
  return <AdminMetricCard {...props} />;
}
