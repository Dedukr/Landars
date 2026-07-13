"use client";

import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface CartHeroProps {
  /**
   * Sum of line quantities **for products currently shown** in the basket list
   * (must match `CartItemList` rows × quantities).
   */
  itemCount: number;
  /** Distinct product rows currently listed. */
  lineCount?: number;
  /**
   * Full cart quantity total when higher than `itemCount` (e.g. product rows still loading).
   * Optional; used only for desktop helper copy.
   */
  pendingQuantityTotal?: number;
  /** Product catalogue / basket merge still in flight. */
  isLoading?: boolean;
  /** Full-page cart skeleton: loading with no lines yet. */
  isInitialLoading?: boolean;
  /** Basket has no lines (after load). */
  isEmpty?: boolean;
  className?: string;
}

/**
 * Premium marketplace-style basket header (mobile-first), aligned with `WishlistHero`.
 */
export default function CartHero({
  itemCount,
  lineCount = 0,
  pendingQuantityTotal,
  isLoading = false,
  isInitialLoading = false,
  isEmpty = false,
  className,
}: CartHeroProps) {
  const showCountBadge = !isLoading && !isEmpty && itemCount > 0;
  const countLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;

  const pending = pendingQuantityTotal ?? itemCount;

  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      <section
        className="relative overflow-hidden rounded-2xl border shadow-sm sm:rounded-3xl"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
        aria-labelledby="cart-hero-title"
        aria-busy={isLoading || isInitialLoading}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 42%, color-mix(in srgb, var(--primary) 8%, transparent) 100%)",
          }}
          aria-hidden
        />

        <div className="relative px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="min-w-0 lg:col-span-8">
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
                  id="cart-hero-title"
                  className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-[1.75rem] lg:leading-snug"
                  style={{ color: "var(--foreground)" }}
                >
                  Your basket
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
                {isEmpty
                  ? "When you add products from the shop, they will appear here so you can review quantities before you continue."
                  : isInitialLoading
                    ? "We are preparing your basket—this only takes a moment."
                    : "Review what you have added and change quantities before you continue. Add more from the shop whenever you like—no rush."}
              </p>

              <div className="mt-5">
                <Button variant="primary" size="md" className="w-full min-h-[48px] sm:w-auto sm:min-w-[11rem]" asChild>
                  <Link href="/shop" className="inline-flex items-center justify-center gap-2">
                    <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
                    Browse the shop
                  </Link>
                </Button>
              </div>
            </div>

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
                <ShoppingBag className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <p className="text-center text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Your order basket
              </p>
              <p className="mt-1 text-center text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                {isEmpty && !isInitialLoading
                  ? "Nothing here yet—browse the shop to add sausages, dairy, pastries, and more."
                  : isLoading && pending > 0 && lineCount === 0
                    ? "Loading your basket lines…"
                    : itemCount > 0
                      ? lineCount === 1
                        ? "One product in your basket—adjust the quantity if you need more."
                        : `${lineCount} products in your basket—tap a line to update or remove.`
                      : isLoading
                        ? "Preparing your basket…"
                        : "Save time by reviewing everything here before the next step."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </header>
  );
}
