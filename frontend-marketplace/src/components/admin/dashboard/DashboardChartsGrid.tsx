import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Cols = 2 | 3;

type Props = {
  cols?: Cols;
  children: ReactNode;
  className?: string;
};

const colsClass: Record<Cols, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

/**
 * Responsive grid container for dashboard chart cards.
 * Defaults to 2-column on large screens; pass cols={3} for the status donut row.
 */
export function DashboardChartsGrid({ cols = 2, children, className }: Props) {
  return (
    <div className={cn("grid gap-4", colsClass[cols], className)}>
      {children}
    </div>
  );
}
