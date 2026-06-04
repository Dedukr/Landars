"use client";

import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";

import { DashboardPeriod, PERIOD_OPTIONS } from "./dashboard.types";

/** Period labels and values — matches Phase 4 spec Section 9. */
export const options = PERIOD_OPTIONS;

type Props = {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
};

/**
 * Dashboard period selector (7d / 30d / 90d / this_month).
 * Parent is responsible for updating URL and refetching data via onChange.
 */
export function DashboardDateRangeSelector({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Select dashboard period"
      className={cn(
        "inline-flex flex-wrap gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm"
      )}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            variant={selected ? "default" : "ghost"}
            size="sm"
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onChange(opt.value);
            }}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
