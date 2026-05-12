"use client";

import Link from "next/link";
import { ArrowLeft, Heart, ShoppingBag, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface WishlistHeroProps {
  /**
   * Count of products **shown in the list below** (must match the grid).
   * Use `filteredAndSortedProducts.length` on the main wishlist view.
   */
  itemCount: number;
  /**
   * Total product ids on the wishlist (from context). Optional context for copy when
   * `itemCount` is lower (filters) or zero while saves still exist (e.g. load error).
   */
  savedTotalCount?: number;
  /** While product rows are loading — count badge is hidden to avoid mismatch. */
  isLoading?: boolean;
  /** Product detail fetch failed for all rows — badge hidden; `savedTotalCount` can inform copy. */
  hasError?: boolean;
  className?: string;
}

/**
 * Premium marketplace-style wishlist header (mobile-first).
 * Uses CSS theme variables only — no hardcoded palette.
 */
export default function WishlistHero({
  itemCount,
  savedTotalCount,
  isLoading = false,
  hasError = false,
  className,
}: WishlistHeroProps) {
  const showCountBadge = !isLoading && itemCount > 0;
  const countLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;

  const savedTotal = savedTotalCount ?? itemCount;

  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      <section
        className="relative overflow-hidden rounded-2xl border shadow-sm sm:rounded-3xl"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
        aria-labelledby="wishlist-hero-title"
        aria-busy={isLoading}
      >
        {/* Warm accent wash — food-marketplace feel, theme-safe */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12] dark:opacity-[0.18]"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 42%, color-mix(in srgb, var(--primary) 8%, transparent) 100%)",
          }}
          aria-hidden
        />

        <div className="relative px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-center lg:gap-8">
            {/* Main column */}
            <div className="min-w-0 lg:col-span-8">
              {/* Compact shop exit — mobile-first */}
              <Link
                href="/shop"
                className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)] rounded-md -ml-1 px-1"
                style={{ color: "var(--primary)" }}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sm:hidden">Shop</span>
                <span className="hidden sm:inline">Back to shop</span>
              </Link>

              <div className="flex flex-wrap items-start gap-3 gap-y-2">
                <h1
                  id="wishlist-hero-title"
                  className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-[1.75rem] lg:leading-snug"
                  style={{ color: "var(--foreground)" }}
                >
                  Your saved favourites
                </h1>
                {showCountBadge && (
                  <span
                    className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums sm:text-sm"
                    style={{
                      background: "var(--sidebar-bg)",
                      borderColor: "var(--sidebar-border)",
                      color: "var(--foreground)",
                    }}
                  >
                    {countLabel}
                  </span>
                )}
              </div>

              <p
                className="mt-2 max-w-2xl text-sm leading-relaxed sm:text-[0.9375rem]"
                style={{ color: "var(--muted-foreground)" }}
              >
                Review your saved items and add them to your basket when you are ready. Your favourite
                LandarsFood products, saved in one place.
              </p>

              {hasError && (
                <p
                  className="mt-2 max-w-2xl text-sm font-medium"
                  style={{ color: "var(--muted-foreground)" }}
                  role="status"
                >
                  Product details could not be loaded below—your list is still here.
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                <Button variant="primary" size="md" className="w-full min-h-[48px] sm:w-auto sm:min-w-[11rem]" asChild>
                  <Link href="/shop" className="inline-flex items-center justify-center gap-2">
                    <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
                    Browse the shop
                  </Link>
                </Button>
                <Button variant="outline" size="md" className="w-full min-h-[48px] sm:w-auto" asChild>
                  <Link href="/" className="inline-flex items-center justify-center gap-2">
                    <Store className="h-4 w-4 shrink-0" aria-hidden />
                    Back to home
                  </Link>
                </Button>
              </div>
            </div>

            {/* Desktop accent card — decorative + brand, no fake data */}
            <div
              className="hidden lg:col-span-4 lg:flex lg:flex-col lg:items-center lg:justify-center lg:rounded-2xl lg:border lg:px-5 lg:py-6"
              style={{
                background: "var(--sidebar-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <div
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                  color: "var(--accent)",
                }}
              >
                <Heart className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <p className="text-center text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Saved for later
              </p>
              <p className="mt-1 text-center text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                {hasError && savedTotal > 0
                  ? "We couldn't load product rows—your saves are still on your account."
                  : itemCount > 0
                    ? "Add anything here to your basket whenever you like."
                    : isLoading && savedTotal > 0
                      ? "Fetching your saved products…"
                      : itemCount === 0 && savedTotal > 0 && !hasError && !isLoading
                        ? "Nothing matches your filters right now. Clear search or category to see all saved items."
                        : "Save products from the shop to see them here."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </header>
  );
}
