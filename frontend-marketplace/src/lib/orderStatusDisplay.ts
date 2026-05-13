import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock,
  Info,
  Package,
  XCircle,
} from "lucide-react";

export type OrderStatusKey = "pending" | "paid" | "issued" | "cancelled";

export interface OrderStatusPresentation {
  label: string;
  description: string;
  Icon: LucideIcon;
  /** Semantic token for badge / border (not progress %) */
  tone: "pending" | "success" | "accent" | "destructive";
}

const STATUS_MAP: Record<OrderStatusKey, OrderStatusPresentation> = {
  pending: {
    label: "Pending",
    description: "We’ve received your order and will update you soon.",
    Icon: Clock,
    tone: "pending",
  },
  paid: {
    label: "Confirmed",
    description: "Your order is confirmed and being prepared.",
    Icon: CheckCircle2,
    tone: "success",
  },
  issued: {
    label: "Issued",
    description: "Your order has been issued and is being processed.",
    Icon: Package,
    tone: "accent",
  },
  cancelled: {
    label: "Cancelled",
    description: "This order was cancelled.",
    Icon: XCircle,
    tone: "destructive",
  },
};

function humanizeRawStatus(status: string): string {
  const s = status.trim();
  if (!s) return "Order received";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getOrderStatusPresentation(
  status: string | null | undefined
): OrderStatusPresentation {
  const key = (status || "").toLowerCase() as OrderStatusKey;
  if (key && key in STATUS_MAP) {
    return STATUS_MAP[key];
  }
  return {
    label: humanizeRawStatus(status || ""),
    description: "We’ll keep this page updated as your order progresses.",
    Icon: Info,
    tone: "pending",
  };
}

export function toneSurfaceClass(tone: OrderStatusPresentation["tone"]): {
  border: string;
  bg: string;
  iconWrap: string;
  iconColor: string;
} {
  switch (tone) {
    case "success":
      return {
        border: "var(--success-border)",
        bg: "var(--success-bg)",
        iconWrap: "var(--success)",
        iconColor: "#ffffff",
      };
    case "destructive":
      return {
        border: "color-mix(in srgb, var(--destructive) 45%, var(--sidebar-border))",
        bg: "color-mix(in srgb, var(--destructive) 10%, var(--card-bg))",
        iconWrap: "var(--destructive)",
        iconColor: "#ffffff",
      };
    case "accent":
      return {
        border: "var(--sidebar-border)",
        bg: "color-mix(in srgb, var(--accent) 12%, var(--card-bg))",
        iconWrap: "var(--accent)",
        iconColor: "var(--primary)",
      };
    default:
      return {
        border: "var(--sidebar-border)",
        bg: "var(--sidebar-bg)",
        iconWrap: "var(--accent)",
        iconColor: "var(--primary)",
      };
  }
}
