"use client";

import { MapPin, Calendar, Package, MessageSquareText } from "lucide-react";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { formatOrderDateLong } from "@/lib/orderFormat";
import { OrderSectionCard } from "./OrderSectionCard";
function formatStructuredAddress(order: MarketplaceOrderDetail): string | null {
  const a = order.address;
  if (a && (a.address_line || a.city || a.postal_code)) {
    const parts = [
      a.address_line,
      a.address_line2,
      a.city,
      a.postal_code,
    ].filter((p) => p && String(p).trim());
    if (parts.length) return parts.join(", ");
  }
  const flat = order.customer_address?.trim();
  return flat || null;
}

function formatBillingAddress(order: MarketplaceOrderDetail): string | null {
  const b = order.billing_address;
  if (!b) return null;
  const parts = [
    b.company_name,
    b.contact_name,
    b.address_line,
    b.address_line2,
    b.city,
    b.postal_code,
  ].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(", ") : null;
}

export function DeliveryFulfillmentCard({ order }: { order: MarketplaceOrderDetail }) {
  const address = formatStructuredAddress(order);
  const billingAddress = formatBillingAddress(order);
  const deliveryDate = order.delivery_date
    ? formatOrderDateLong(order.delivery_date)
    : null;
  const deliveryOption = order.is_home_delivery ? "Home delivery" : "Post";
  const notes = order.notes?.trim();

  if (!address && !billingAddress && !deliveryDate && !notes) {
    return null;
  }

  return (
    <OrderSectionCard aria-labelledby="fulfillment-heading">
      <h2
        id="fulfillment-heading"
        className="mb-4 text-lg font-bold sm:text-xl"
        style={{ color: "var(--foreground)" }}
      >
        Delivery &amp; notes
      </h2>
      <div className="space-y-5">
        {address ? (
          <div className="flex gap-3">
            <MapPin
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {order.is_home_delivery ? "Delivery address" : "Address on order"}
              </p>
              <p
                className="mt-1 text-sm leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {address}
              </p>
            </div>
          </div>
        ) : null}

        {billingAddress ? (
          <div className="flex gap-3">
            <MapPin
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Billing address
                {order.bill_use_delivery_address ? " (same as delivery)" : ""}
              </p>
              <p
                className="mt-1 text-sm leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {billingAddress}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex gap-3">
          <Package
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Delivery option
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              {deliveryOption}
            </p>
          </div>
        </div>

        {deliveryDate ? (
          <div className="flex gap-3">
            <Calendar
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Preferred date
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                {deliveryDate}
              </p>
            </div>
          </div>
        ) : null}

        {notes ? (
          <div className="flex gap-3">
            <MessageSquareText
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Your note
              </p>
              <p
                className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {notes}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </OrderSectionCard>
  );
}
