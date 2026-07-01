import React from "react";
import { Package, Store } from "lucide-react";

interface ReviewTypeBadgeProps {
  type: "product" | "shop";
  size?: "sm" | "md";
}

const STYLES = {
  shop: {
    bg: "rgba(245,158,11,0.1)",
    color: "#b45309",
    border: "rgba(245,158,11,0.3)",
  },
  product: {
    bg: "rgba(99,102,241,0.1)",
    color: "#4f46e5",
    border: "rgba(99,102,241,0.3)",
  },
};

export default function ReviewTypeBadge({ type, size = "sm" }: ReviewTypeBadgeProps) {
  const s = STYLES[type];
  const isShop = type === "shop";
  const Icon = isShop ? Store : Package;
  const label = isShop ? "Shop review" : "Product review";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full font-medium border",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      ].join(" ")}
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
      title={label}
    >
      {/* Icon is decorative — the visible text already conveys the meaning */}
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
