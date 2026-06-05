"use client";

import { User } from "lucide-react";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { ContactLink } from "@/components/ContactLink";
import { OrderSectionCard } from "./OrderSectionCard";

export function CustomerDetailsCard({ order }: { order: MarketplaceOrderDetail }) {
  const firstName =
    order.customer_first_name?.trim() ||
    order.customer?.first_name?.trim() ||
    null;
  const surname =
    order.customer_surname?.trim() ||
    order.customer?.surname?.trim() ||
    null;
  const legacyName =
    order.customer_name?.trim() ||
    order.customer?.name?.trim() ||
    null;
  const email = order.customer?.email?.trim() || null;
  const phone = order.customer_phone?.trim() || null;

  if (!firstName && !surname && !legacyName && !email && !phone) return null;

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
        {firstName ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              First name
            </dt>
            <dd style={{ color: "var(--foreground)" }}>{firstName}</dd>
          </div>
        ) : null}
        {surname ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Surname
            </dt>
            <dd style={{ color: "var(--foreground)" }}>{surname}</dd>
          </div>
        ) : null}
        {!firstName && !surname && legacyName ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Name
            </dt>
            <dd style={{ color: "var(--foreground)" }}>{legacyName}</dd>
          </div>
        ) : null}
        {email ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Email
            </dt>
            <dd>
              <ContactLink
                href={`mailto:${encodeURIComponent(email)}`}
                variant="inline"
                className="break-all"
              >
                {email}
              </ContactLink>
            </dd>
          </div>
        ) : null}
        {phone ? (
          <div>
            <dt className="font-medium" style={{ color: "var(--muted-foreground)" }}>
              Phone
            </dt>
            <dd>
              <ContactLink href={`tel:${phone.replace(/\s/g, "")}`} variant="inline">
                {phone}
              </ContactLink>
            </dd>
          </div>
        ) : null}
      </dl>
    </OrderSectionCard>
  );
}
