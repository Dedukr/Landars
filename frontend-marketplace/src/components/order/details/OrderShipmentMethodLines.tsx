"use client";

import { parseShipmentMethodName } from "@/lib/shipmentMethodDisplay";

export function OrderShipmentMethodLines({
  carrier,
  serviceName,
}: {
  carrier?: string;
  serviceName?: string;
}) {
  if (!carrier?.trim() && !serviceName?.trim()) {
    return null;
  }
  const { headline, subtitle } = serviceName?.trim()
    ? parseShipmentMethodName(serviceName)
    : { headline: "", subtitle: "" };

  return (
    <div
      className="mt-1 space-y-1 text-sm"
      style={{ color: "var(--muted-foreground)" }}
    >
      {carrier?.trim() ? (
        <p style={{ color: "var(--foreground)" }}>{carrier}</p>
      ) : null}
      {serviceName?.trim() ? (
        <>
          {headline ? (
            <p className="font-semibold" style={{ color: "var(--foreground)" }}>
              {headline}
            </p>
          ) : null}
          {subtitle ? (
            <p>{subtitle}</p>
          ) : !headline ? (
            <p>{serviceName}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
