"use client";
import React, { memo } from "react";

interface WishlistStats {
  totalItems: number;
  totalValue: number;
  averagePrice: number;
  categories: string[];
}

interface WishlistStatsProps {
  stats: WishlistStats | null;
}

const WishlistStats = memo<WishlistStatsProps>(({ stats }) => {
  if (!stats) return null;

  return (
    <div
      className="rounded-lg shadow-sm p-6 mb-6"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--accent)" }}
          >
            {stats.totalItems}
          </div>
          <div
            className="text-sm"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Items
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--accent)" }}
          >
            £{stats.totalValue.toFixed(2)}
          </div>
          <div
            className="text-sm"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Total Value
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--accent)" }}
          >
            £{stats.averagePrice.toFixed(2)}
          </div>
          <div
            className="text-sm"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Avg. Price
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--accent)" }}
          >
            {stats.categories.length}
          </div>
          <div
            className="text-sm"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Categories
          </div>
        </div>
      </div>
    </div>
  );
});

WishlistStats.displayName = "WishlistStats";

export default WishlistStats;
