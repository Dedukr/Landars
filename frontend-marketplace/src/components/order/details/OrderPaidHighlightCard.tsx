"use client";

import { Sparkles } from "lucide-react";
import { formatOrderDateLong } from "@/lib/orderFormat";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { OrderSectionCard } from "./OrderSectionCard";

/** Shown only when backend status is `paid` — copy avoids payment-instrument details. */
export function OrderPaidHighlightCard({ order }: { order: MarketplaceOrderDetail }) {
  if (order.status !== "paid") return null;

  const when = order.delivery_date
    ? formatOrderDateLong(order.delivery_date)
    : null;

  return (
    <OrderSectionCard className="border-[var(--success-border)] bg-[var(--success-bg)]">
      <div className="flex gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--success)" }}
          aria-hidden
        >
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <div>
          <p className="font-bold" style={{ color: "var(--success-text)" }}>
            Order confirmed
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--success-text)" }}>
            Thank you — we&apos;re preparing your order
            {when ? (
              <>
                {" "}
                for{" "}
                <span className="font-semibold">{when}</span>
              </>
            ) : null}
            .
          </p>
        </div>
      </div>
    </OrderSectionCard>
  );
}
