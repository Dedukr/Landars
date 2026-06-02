import type { ReactNode } from "react";

import { adminDesign } from "@/lib/admin-design";
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
    <div className={cn(adminDesign.card, className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={adminDesign.description}>{title}</p>
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
