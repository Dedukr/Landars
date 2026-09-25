"use client";
import React, { memo } from "react";
import { jerkyPromoNudge, jerkyPromoRowLabel } from "@/lib/jerkyPromo";

interface PromoDiscountDisplayProps {
  promoDiscount: number;
  freeUnits?: number;
  unitsToNextFree?: number;
  label?: string | null;
}

const PromoDiscountDisplay = memo<PromoDiscountDisplayProps>(
  ({ promoDiscount, freeUnits = 0, unitsToNextFree = 0, label }) => {
    const nudge = jerkyPromoNudge(unitsToNextFree);
    if (promoDiscount <= 0 && !nudge) return null;

    return (
      <div className="space-y-1">
        {promoDiscount > 0 && (
          <div
            className="flex justify-between text-sm"
            style={{ color: "var(--success)" }}
          >
            <span>{jerkyPromoRowLabel(freeUnits, label)}</span>
            <span>-£{promoDiscount.toFixed(2)}</span>
          </div>
        )}
        {nudge && (
          <p
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium"
            style={{
              background: "var(--success-bg)",
              border: "1px solid var(--success-border)",
              color: "var(--success-text)",
            }}
          >
            {nudge}
          </p>
        )}
      </div>
    );
  }
);

PromoDiscountDisplay.displayName = "PromoDiscountDisplay";

export default PromoDiscountDisplay;
