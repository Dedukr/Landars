import React from "react";
import { Clock, CheckCircle, Package, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "paid" | "issued" | "cancelled";

const STATUS_MAP: Record<
  OrderStatus,
  {
    label: string;
    icon: React.ElementType;
    style: React.CSSProperties;
  }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    style: {
      background: "rgba(217,164,65,0.12)",
      color: "#b8860b",
      border: "1px solid rgba(217,164,65,0.35)",
    },
  },
  paid: {
    label: "Confirmed",
    icon: CheckCircle,
    style: {
      background: "var(--success-bg)",
      color: "var(--success-text)",
      border: "1px solid var(--success-border)",
    },
  },
  issued: {
    label: "Issued",
    icon: Package,
    style: {
      background: "var(--info-bg)",
      color: "var(--info-text)",
      border: "1px solid var(--info-border)",
    },
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    style: {
      background: "rgba(220,38,38,0.1)",
      color: "var(--destructive)",
      border: "1px solid rgba(220,38,38,0.3)",
    },
  },
};

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export default function StatusBadge({
  status,
  size = "md",
  className,
}: StatusBadgeProps) {
  const cfg = STATUS_MAP[status as OrderStatus] ?? STATUS_MAP.pending;
  const Icon = cfg.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
      style={cfg.style}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {cfg.label}
    </span>
  );
}

export { STATUS_MAP };
export type { OrderStatus };
