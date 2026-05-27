"use client";

import { LifeBuoy } from "lucide-react";
import { ContactLink } from "@/components/ContactLink";
import { OrderSectionCard } from "./OrderSectionCard";

export function OrderSupportCard() {
  const phone = process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "";
  const digits = phone.replace(/\D/g, "");
  const whatsAppUrl = digits ? `https://api.whatsapp.com/send?phone=${digits}` : null;

  return (
    <OrderSectionCard>
      <div className="flex gap-3">
        <LifeBuoy
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: "var(--accent)" }}
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Need help?
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            Questions about this order? Reach us on{" "}
            {whatsAppUrl ? (
              <ContactLink href={whatsAppUrl} variant="inline">
                WhatsApp
              </ContactLink>
            ) : (
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                WhatsApp
              </span>
            )}
            {phone && digits ? (
              <>
                {" "}
                <ContactLink href={`tel:${digits}`} variant="inline" className="tabular-nums">
                  ({phone})
                </ContactLink>
              </>
            ) : phone ? (
              <span className="tabular-nums"> ({phone})</span>
            ) : null}
            .
          </p>
        </div>
      </div>
    </OrderSectionCard>
  );
}
