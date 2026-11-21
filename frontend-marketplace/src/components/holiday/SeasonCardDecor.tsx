"use client";

import { useSeason } from "@/contexts/SeasonContext";
import { holidayUnitPrice, percentOf } from "@/lib/holidayApi";

/**
 * Second price line while the basket is a holiday order, so the 15% never
 * surprises anyone at checkout: "🎄 Christmas £11.50".
 */
export function SeasonPriceNote({
  price,
  className = "",
}: {
  price: number;
  className?: string;
}) {
  const { cartOccasion, cartIsPost } = useSeason();
  const percent = percentOf(cartOccasion);
  if (!cartOccasion || cartIsPost || !percent || !Number.isFinite(price)) {
    return null;
  }
  return (
    <span className={`season-price-note ${className}`.trim()}>
      {cartOccasion.emoji} {cartOccasion.name} £
      {holidayUnitPrice(price, percent).toFixed(2)}
    </span>
  );
}
