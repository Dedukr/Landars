import { Gift, Truck } from "lucide-react";
import { JERKY_PROMO_DESCRIPTION } from "@/lib/jerkyPromo";
import { FREE_HOME_DELIVERY_THRESHOLD } from "@/utils/deliveryFeeCalculator";

const pillStyle = {
  background: "var(--success-bg)",
  borderColor: "var(--success-border)",
  color: "var(--success-text)",
};

const pillClass =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold leading-tight";

const shopPillClass =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-1 text-[10px] font-semibold leading-tight min-[340px]:px-2 min-[380px]:gap-1.5 min-[380px]:px-2.5 min-[380px]:py-1.5 min-[380px]:text-[11px] sm:px-3 sm:text-xs";

/** Store offers shown at the top of the home and shop pages. */
export default function OfferPills({
  className = "",
  nowrap = false,
}: {
  className?: string;
  /** Keep both offers on one line. */
  nowrap?: boolean;
}) {
  return (
    <div
      className={`flex items-center ${nowrap ? "w-max flex-nowrap gap-1 min-[340px]:gap-1.5 min-[380px]:gap-2" : "flex-wrap gap-2"} ${className}`}
      role="list"
      aria-label="Current offers"
    >
      <span role="listitem" className={nowrap ? shopPillClass : pillClass} style={pillStyle}>
        <Truck
          className={
            nowrap
              ? "h-3 w-3 shrink-0 min-[380px]:h-3.5 min-[380px]:w-3.5"
              : "h-3.5 w-3.5 shrink-0"
          }
          strokeWidth={2.25}
          aria-hidden
        />
        Free delivery above £{FREE_HOME_DELIVERY_THRESHOLD}
      </span>
      <span
        role="listitem"
        className={nowrap ? shopPillClass : pillClass}
        style={pillStyle}
        title={JERKY_PROMO_DESCRIPTION}
      >
        <Gift
          className={
            nowrap
              ? "h-3 w-3 shrink-0 min-[380px]:h-3.5 min-[380px]:w-3.5"
              : "h-3.5 w-3.5 shrink-0"
          }
          strokeWidth={2.25}
          aria-hidden
        />
        5+1 Jerky
        <span className="font-medium" style={{ opacity: 0.85 }}>
          Buy 5, get 1 free
        </span>
      </span>
    </div>
  );
}
