import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminMetricCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: string;
  className?: string;
};

export function AdminMetricCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
}: AdminMetricCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        {icon ? (
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</div>
        ) : null}
      </div>
      {description || trend ? (
        <div className="mt-3 text-xs text-muted-foreground">
          {trend ? <span>{trend}</span> : null}
          {description ? <span>{description}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
