"use client";

import type { OrderListItem } from "@/lib/orderTypes";

const PREVIEW_LIMIT = 3;

interface OrderItemsPreviewProps {
  items: OrderListItem[] | undefined;
  className?: string;
}

export default function OrderItemsPreview({ items, className }: OrderItemsPreviewProps) {
  const list = Array.isArray(items) ? items.filter((i) => i?.product_name?.trim()) : [];
  if (list.length === 0) return null;

  const shown = list.slice(0, PREVIEW_LIMIT);
  const remaining = list.length - shown.length;

  const names = shown.map((item) => item.product_name.trim()).join(", ");

  return (
    <p
      className={className}
      style={{ color: "var(--muted-foreground)" }}
      title={list.map((i) => i.product_name).join(", ")}
    >
      <span className="line-clamp-2 text-sm leading-snug">
        {names}
        {remaining > 0 ? (
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>
            {" "}
            +{remaining} more
          </span>
        ) : null}
      </span>
    </p>
  );
}
