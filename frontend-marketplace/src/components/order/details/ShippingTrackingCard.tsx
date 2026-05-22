"use client";

import { Truck, ExternalLink, AlertCircle, CalendarCheck, CheckCircle2 } from "lucide-react";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { formatOrderDateShort, formatOrderDateTime } from "@/lib/orderFormat";
import { OrderSectionCard } from "./OrderSectionCard";
import { OrderShipmentMethodLines } from "./OrderShipmentMethodLines";

function shipmentStatusText(order: MarketplaceOrderDetail): string | null {
  const raw = order.shipment_status ?? order.shipping_status;
  if (!raw?.trim()) return null;
  return raw.trim();
}

export function ShippingTrackingCard({ order }: { order: MarketplaceOrderDetail }) {
  if (order.is_home_delivery) {
    return null;
  }

  const statusText = shipmentStatusText(order);
  const hasTracking = !!order.shipping_tracking_number?.trim();
  const hasCarrier = !!(
    order.shipping_carrier?.trim() || order.shipping_service_name?.trim()
  );

  const expectedDateFormatted = formatOrderDateShort(order.expected_delivery_date);
  const deliveredAtFormatted = formatOrderDateTime(order.delivered_at);

  const isDelivered = !!order.delivered_at;

  const hasShippingBlock =
    hasTracking ||
    hasCarrier ||
    !!statusText ||
    !!order.shipping_error_message?.trim() ||
    !!expectedDateFormatted ||
    !!deliveredAtFormatted;

  const showPrepareOnly =
    order.status === "paid" &&
    !!order.shipping_method_id &&
    !hasTracking &&
    !order.shipping_error_message?.trim();

  if (!hasShippingBlock && !showPrepareOnly) return null;

  return (
    <OrderSectionCard aria-labelledby="shipping-heading">
      <div className="mb-4 flex items-center gap-2">
        <Truck
          className="h-5 w-5 shrink-0"
          style={{ color: "var(--accent)" }}
          aria-hidden
        />
        <h2
          id="shipping-heading"
          className="text-lg font-bold sm:text-xl"
          style={{ color: "var(--foreground)" }}
        >
          Shipping &amp; tracking
        </h2>
      </div>

      <div className="space-y-5">
        {hasCarrier ? (
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Service
            </p>
            <OrderShipmentMethodLines
              carrier={order.shipping_carrier}
              serviceName={order.shipping_service_name}
            />
          </div>
        ) : null}

        {statusText ? (
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Shipment status
            </p>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {statusText}
            </p>
          </div>
        ) : null}

        {hasTracking ? (
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Tracking
            </p>
            {order.shipping_tracking_url?.trim() ? (
              <a
                href={order.shipping_tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-md"
                style={{ color: "var(--primary)" }}
              >
                {order.shipping_tracking_number}
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              </a>
            ) : (
              <p
                className="mt-1 font-mono text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                {order.shipping_tracking_number}
              </p>
            )}
          </div>
        ) : null}

        {isDelivered && deliveredAtFormatted ? (
          <div
            className="flex items-start gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: "var(--success-border, color-mix(in srgb, var(--success, #16a34a) 35%, var(--sidebar-border)))",
              background: "var(--success-bg, color-mix(in srgb, var(--success, #16a34a) 8%, var(--card-bg)))",
            }}
          >
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--success, #16a34a)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Delivered
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                {deliveredAtFormatted}
              </p>
            </div>
          </div>
        ) : expectedDateFormatted ? (
          <div className="flex items-start gap-3">
            <CalendarCheck
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Expected delivery
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                {expectedDateFormatted}
              </p>
            </div>
          </div>
        ) : null}

        {order.shipping_error_message?.trim() ? (
          <div
            className="flex gap-3 rounded-xl border p-3"
            style={{
              borderColor: "color-mix(in srgb, var(--destructive) 35%, var(--sidebar-border))",
              background: "color-mix(in srgb, var(--destructive) 6%, var(--card-bg))",
            }}
            role="status"
          >
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "var(--destructive)" }}
              aria-hidden
            />
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
              {order.shipping_error_message.trim()}
            </p>
          </div>
        ) : null}

        {showPrepareOnly && !hasCarrier && !statusText ? (
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            We&apos;re preparing your shipment. Tracking will appear here when it&apos;s
            available.
          </p>
        ) : null}
      </div>
    </OrderSectionCard>
  );
}
