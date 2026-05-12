"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface MobileCartActionBarProps {
  total: number;
  totalItems: number;
}

/**
 * Sticky bottom action bar shown on mobile only (hidden on sm and above).
 * Provides quick access to the total price and the main checkout action.
 * The parent page must add pb-20 sm:pb-0 to avoid content being obscured.
 */
export default function MobileCartActionBar({
  total,
  totalItems,
}: MobileCartActionBarProps) {
  return (
    <div
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3"
      style={{
        background: "var(--card-bg)",
        borderTop: "1px solid var(--sidebar-border)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
      }}
      aria-label="Order total and checkout"
    >
      <div className="flex items-center gap-3">
        {/* Total */}
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Total ({totalItems} {totalItems === 1 ? "item" : "items"})
          </p>
          <p
            className="text-lg font-bold leading-tight"
            style={{ color: "var(--foreground)" }}
          >
            £{total.toFixed(2)}
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/checkout"
          className="flex items-center gap-1.5 px-5 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition-all active:scale-[0.97]"
          style={{ background: "var(--primary)", color: "white" }}
          aria-label={`Review order — total £${total.toFixed(2)}`}
        >
          Review order
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
