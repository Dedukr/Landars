"use client";

import { ClipboardList } from "lucide-react";
import type { OrderDetailItem } from "@/lib/orderDetailTypes";
import { OrderSectionCard } from "./OrderSectionCard";
import { OrderDetailItemCard } from "./OrderDetailItemCard";

export function OrderItemsSection({
  items,
  totalItems,
}: {
  items: OrderDetailItem[];
  totalItems: number;
}) {
  return (
    <OrderSectionCard aria-labelledby="order-items-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList
            className="h-5 w-5 shrink-0"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <h2
            id="order-items-heading"
            className="text-lg font-bold sm:text-xl"
            style={{ color: "var(--foreground)" }}
          >
            Items
          </h2>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold sm:text-sm"
          style={{
            background: "var(--sidebar-bg)",
            color: "var(--foreground)",
            border: "1px solid var(--sidebar-border)",
          }}
        >
          {totalItems} {totalItems === 1 ? "item" : "items"}
        </span>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <OrderDetailItemCard item={item} />
          </li>
        ))}
      </ul>
    </OrderSectionCard>
  );
}
