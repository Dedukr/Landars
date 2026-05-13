"use client";

import { User } from "lucide-react";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { OrderSectionCard } from "./OrderSectionCard";

export function CustomerDetailsCard({ order }: { order: MarketplaceOrderDetail }) {
  const name =
    order.customer_name?.trim() ||
    order.customer?.name?.trim() ||
    null;
  const email = order.customer?.email?.trim() || null;
  const phone = order.customer_phone?.trim() || null;

  if (!name && !email && !phone) return null;

  return (
    <OrderSectionCard aria-labelledby="customer-details-heading">
      <div className="mb-3 flex items-center gap-2">
        <User
          className="h-5 w-5 shrink-0"
          style={{ color: "var(--accent)" }}
          aria-hidden
        />
        <h2
          id="customer-details-heading"
          className="text-lg font-bold"
          style={{ color: "var(--foreground)" }}
        >
          Your details
        </h2>
      </div>
      <dl className="space-y-3 text-sm">
        {name ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Name
            </dt>
            <dd style={{ color: "var(--foreground)" }}>{name}</dd>
          </div>
        ) : null}
        {email ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Email
            </dt>
            <dd>
              <a
                href={`mailto:${encodeURIComponent(email)}`}
                className="break-all font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm"
                style={{ color: "var(--primary)" }}
              >
                {email}
              </a>
            </dd>
          </div>
        ) : null}
        {phone ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Phone
            </dt>
            <dd>
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm"
                style={{ color: "var(--primary)" }}
              >
                {phone}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </OrderSectionCard>
  );
}
