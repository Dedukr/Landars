"use client";

import { formatGbpPrice } from "@/lib/formatPrice";
import type { WishlistStatsData } from "@/lib/wishlistTypes";

interface WishlistSummaryStripProps {
  stats: WishlistStatsData | null;
}

export default function WishlistSummaryStrip({ stats }: WishlistSummaryStripProps) {
  if (!stats || stats.totalItems === 0) return null;

  const totalFmt = formatGbpPrice(stats.totalValue) ?? "—";

  const divider = (
    <div
      className="hidden sm:block w-px self-stretch min-h-[2.5rem] shrink-0"
      style={{ background: "var(--sidebar-border)" }}
      aria-hidden="true"
    />
  );

  return (
    <section
      className="mb-5 sm:mb-6 rounded-2xl border px-4 py-4 sm:px-6"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
      aria-label="Wishlist summary"
    >
      <div className="flex flex-row items-stretch justify-center gap-6 sm:gap-10">
        <div className="min-w-0 text-center px-1">
          <p
            className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            Saved
          </p>
          <p className="text-lg sm:text-xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
            {stats.totalItems}
          </p>
        </div>
        {divider}
        <div className="min-w-0 text-center px-1">
          <p
            className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            Total
          </p>
          <p className="text-lg sm:text-xl font-bold tabular-nums truncate" style={{ color: "var(--foreground)" }}>
            {totalFmt}
          </p>
        </div>
      </div>
    </section>
  );
}
