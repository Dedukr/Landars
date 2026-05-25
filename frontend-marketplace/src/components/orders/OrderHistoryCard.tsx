"use client";

import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Package,
  RotateCcw,
  Truck,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { formatGbpPrice } from "@/lib/formatPrice";
import { formatOrderDateShort } from "@/lib/orderFormat";
import type { OrderListEntry } from "@/lib/orderTypes";
import OrderItemsPreview from "./OrderItemsPreview";
import { cn } from "@/lib/utils";

interface OrderHistoryCardProps {
  order: OrderListEntry;
  onReorder?: () => void;
  reordering?: boolean;
}

function formatItemCount(total: number | undefined): string | null {
  if (total === null || total === undefined) return null;
  const n = typeof total === "number" ? total : parseFloat(String(total));
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  return `${rounded} ${rounded === 1 ? "item" : "items"}`;
}

function deliveryMethodLabel(order: OrderListEntry): string {
  return order.is_home_delivery ? "Home delivery" : "Post / collection";
}

export default function OrderHistoryCard({
  order,
  onReorder,
  reordering = false,
}: OrderHistoryCardProps) {
  const placed = formatOrderDateShort(order.created_at);
  const total = formatGbpPrice(order.total_price);
  const itemCount = formatItemCount(order.total_items);
  const deliveryDate = order.delivery_date
    ? formatOrderDateShort(order.delivery_date)
    : null;

  const canReorder =
    order.status === "paid" ||
    order.status === "issued" ||
    order.status === "cancelled";

  const shipmentLabel = order.shipment_status?.trim() || null;

  return (
    <article
      className={cn(
        "rounded-2xl border transition-shadow duration-200",
        "hover:shadow-md focus-within:ring-2 focus-within:ring-[var(--ring)]"
      )}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="p-4 sm:p-5">
        {/* Mobile-first: reference + badge */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-base font-bold tracking-tight sm:text-lg"
              style={{ color: "var(--foreground)" }}
            >
              Order #{order.id}
            </p>
            {placed ? (
              <p className="mt-0.5 text-xs sm:text-sm" style={{ color: "var(--muted-foreground)" }}>
                Placed {placed}
              </p>
            ) : null}
          </div>
          <StatusBadge status={order.status} size="sm" className="shrink-0" />
        </div>

        {/* Date + total row */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
            {deliveryDate ? (
              <span style={{ color: "var(--muted-foreground)" }}>
                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                  Delivery
                </span>{" "}
                {deliveryDate}
              </span>
            ) : null}
            <span style={{ color: "var(--muted-foreground)" }}>
              {deliveryMethodLabel(order)}
            </span>
          </div>
          {total ? (
            <p
              className="text-lg font-bold tabular-nums sm:text-xl"
              style={{ color: "var(--foreground)" }}
            >
              {total}
            </p>
          ) : null}
        </div>

        {shipmentLabel ? (
          <p
            className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{
              background: "var(--sidebar-bg)",
              borderColor: "var(--sidebar-border)",
              color: "var(--foreground)",
            }}
          >
            <Truck className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} aria-hidden />
            <span className="truncate">{shipmentLabel}</span>
          </p>
        ) : null}

        <OrderItemsPreview items={order.items} className="mt-3" />

        {/* Desktop: actions row */}
        <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium sm:text-sm" style={{ color: "var(--muted-foreground)" }}>
            {itemCount ? (
              <span className="inline-flex items-center gap-1">
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {itemCount}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {canReorder && onReorder ? (
              <Button
                type="button"
                variant="outline"
                size="md"
                className="min-h-[44px] w-full sm:w-auto"
                onClick={onReorder}
                loading={reordering}
                icon={<RotateCcw className="h-4 w-4" aria-hidden />}
              >
                Reorder
              </Button>
            ) : null}

            {order.invoice_link ? (
              <Button variant="ghost" size="md" className="min-h-[44px] w-full sm:w-auto" asChild>
                <a
                  href={order.invoice_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2"
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  Invoice
                </a>
              </Button>
            ) : null}

            <Button variant="primary" size="md" className="min-h-[48px] w-full sm:min-w-[10.5rem] sm:w-auto" asChild>
              <Link
                href={`/orders/${order.id}`}
                className="inline-flex items-center justify-center gap-2"
              >
                View details
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
