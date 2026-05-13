"use client";

import { formatGbpPrice } from "@/lib/formatPrice";
import type { MarketplaceOrderDetail, OrderDetailItem } from "@/lib/orderDetailTypes";
import { OrderSectionCard } from "./OrderSectionCard";
import { Button } from "@/components/ui/Button";
import { Receipt } from "lucide-react";

function computeSubtotalFallback(items: OrderDetailItem[]): number | null {
  let sum = 0;
  let n = 0;
  for (const item of items) {
    const raw =
      item.total_price ?? item.get_total_price ?? null;
    if (raw == null || String(raw).trim() === "") continue;
    const v = parseFloat(String(raw));
    if (Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n > 0 ? sum : null;
}

function PriceRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | null;
  emphasize?: "success";
}) {
  if (value == null) return null;
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 text-sm">
      <span
        style={{
          color:
            emphasize === "success" ? "var(--success-text)" : "var(--muted-foreground)",
        }}
      >
        {label}
      </span>
      <span
        className="tabular-nums font-medium"
        style={{
          color:
            emphasize === "success" ? "var(--success-text)" : "var(--foreground)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function OrderSummaryCard({
  order,
  onViewAllOrders,
}: {
  order: MarketplaceOrderDetail;
  onViewAllOrders: () => void;
}) {
  const subFromApi = formatGbpPrice(order.sum_price);
  const fallbackNum = computeSubtotalFallback(order.items || []);
  const subtotal =
    subFromApi ??
    (fallbackNum != null ? formatGbpPrice(fallbackNum) : null);

  const deliveryNum = parseFloat(String(order.delivery_fee ?? "0"));
  const deliveryFormatted =
    Number.isFinite(deliveryNum) && deliveryNum === 0
      ? "Free"
      : formatGbpPrice(order.delivery_fee);

  const discountNum = parseFloat(String(order.discount ?? "0"));
  const showDiscount = Number.isFinite(discountNum) && discountNum > 0;
  const discountFormatted = showDiscount
    ? `−£${discountNum.toFixed(2)}`
    : null;

  const totalFormatted = formatGbpPrice(order.total_price);

  return (
    <OrderSectionCard aria-labelledby="order-summary-heading">
      <div className="mb-4 flex items-center gap-2">
        <Receipt
          className="h-5 w-5 shrink-0"
          style={{ color: "var(--accent)" }}
          aria-hidden
        />
        <h2
          id="order-summary-heading"
          className="text-lg font-bold sm:text-xl"
          style={{ color: "var(--foreground)" }}
        >
          Summary
        </h2>
      </div>

      <div className="space-y-1">
        <PriceRow
          label={`Subtotal (${order.total_items} items)`}
          value={subtotal}
        />
        <PriceRow label="Delivery" value={deliveryFormatted} />
        {showDiscount ? (
          <PriceRow label="Discount" value={discountFormatted} emphasize="success" />
        ) : null}
      </div>

      <div
        className="mt-4 border-t pt-4"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
            Total
          </span>
          <span
            className="text-2xl font-bold tabular-nums"
            style={{ color: "var(--foreground)" }}
          >
            {totalFormatted ?? "—"}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          fullWidth
          onClick={onViewAllOrders}
        >
          View all orders
        </Button>
        {order.invoice_link ? (
          <Button
            type="button"
            variant="success"
            size="lg"
            fullWidth
            onClick={() => {
              window.open(order.invoice_link, "_blank", "noopener,noreferrer");
            }}
          >
            Download invoice
          </Button>
        ) : null}
      </div>
    </OrderSectionCard>
  );
}
