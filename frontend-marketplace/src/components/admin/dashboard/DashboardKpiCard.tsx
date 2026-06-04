import type { ComponentType } from "react";
import Link from "next/link";

import { adminDesign } from "@/lib/admin-design";
import { cn } from "@/lib/utils";

export type DashboardKpiCardProps = {
  title: string;
  value: string | number;
  description?: string;
  /**
   * Lucide-react icon component (not an instance).
   * Pass as: icon={ShoppingCart}  — NOT icon={<ShoppingCart />}
   */
  icon?: ComponentType<{ className?: string }>;
  /**
   * If provided the whole card becomes a link.
   * Use intended final admin URLs even if the target page isn't built yet.
   */
  href?: string;
  className?: string;
};

function KpiCardInner({
  title,
  value,
  description,
  icon: Icon,
  className,
}: DashboardKpiCardProps) {
  return (
    <div className={cn(adminDesign.card, "group", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={adminDesign.description}>{title}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight">
            {value}
          </p>
        </div>
        {Icon && (
          <div className="shrink-0 rounded-lg bg-muted p-2 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {description && (
        <p className="mt-3 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function DashboardKpiCard(props: DashboardKpiCardProps) {
  if (props.href) {
    return (
      <Link href={props.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        <KpiCardInner {...props} />
      </Link>
    );
  }
  return <KpiCardInner {...props} />;
}
