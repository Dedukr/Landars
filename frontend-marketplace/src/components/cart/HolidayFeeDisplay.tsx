"use client";
import React, { memo } from "react";
import type { HolidayEvent } from "@/lib/holidayApi";

interface HolidayFeeDisplayProps {
  event: HolidayEvent | null | undefined;
  /** Percent actually applied (0 when not applicable, e.g. parcel orders). */
  percent: number;
  amount: number;
}

/** "🎄 Christmas rate (15%)  +£6.00" — the holiday line in price breakdowns. */
const HolidayFeeDisplay = memo<HolidayFeeDisplayProps>(
  ({ event, percent, amount }) => {
    if (!event || !(percent > 0)) return null;
    return (
      <div className="season-fee-row flex justify-between gap-3 text-sm">
        <span>
          {event.emoji} {event.name} rate ({percent}%)
        </span>
        <span className="font-semibold tabular-nums">+£{amount.toFixed(2)}</span>
      </div>
    );
  }
);

HolidayFeeDisplay.displayName = "HolidayFeeDisplay";

export default HolidayFeeDisplay;
