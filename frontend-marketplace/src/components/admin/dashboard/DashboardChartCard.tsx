import type { ReactNode } from "react";

import { AdminCard } from "@/components/admin/ui/AdminCard";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Thin card wrapper that keeps all dashboard chart cards visually consistent.
 * Use instead of AdminCard directly inside chart components.
 */
export function DashboardChartCard({ title, description, children, className }: Props) {
  return (
    <AdminCard title={title} description={description} className={className}>
      {children}
    </AdminCard>
  );
}
