"use client";
import React, { memo } from "react";

interface DiscountDisplayProps {
  discount: number;
}

const DiscountDisplay = memo<DiscountDisplayProps>(({ discount }) => {
  if (discount <= 0) return null;

  return (
    <div
      className="flex justify-between text-sm"
      style={{ color: "var(--success)" }}
    >
      <span>Discount</span>
      <span>-£{discount.toFixed(2)}</span>
    </div>
  );
});

DiscountDisplay.displayName = "DiscountDisplay";

export default DiscountDisplay;
