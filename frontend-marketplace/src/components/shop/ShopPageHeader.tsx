"use client";

import React from "react";
import { ShopHeroSidePanel } from "@/components/shop/ShopHeroSidePanel";

interface ShopPageHeaderProps {
  productCount?: number | null;
  categoryCount?: number | null;
  statsLoading?: boolean;
}

export function ShopPageHeader({
  productCount,
  categoryCount,
  statsLoading = false,
}: ShopPageHeaderProps) {
  const showCounts =
    !statsLoading && productCount !== null && productCount !== undefined;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border px-4 py-5 sm:px-8 sm:py-10 mb-4 sm:mb-8 lg:mb-8"
      style={{
        borderColor: "var(--sidebar-border)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--card-bg)) 0%, var(--card-bg) 38%, color-mix(in srgb, var(--primary) 6%, var(--sidebar-bg)) 100%)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Soft washes */}
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--accent)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/4 bottom-[-40%] h-72 w-72 rounded-full opacity-[0.08] blur-3xl"
        style={{ background: "var(--primary)" }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12 xl:gap-16">
        <div className="min-w-0 flex-1 max-w-xl lg:max-w-[min(100%,540px)]">
          <p
            className="hidden lg:block text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] mb-2"
            style={{ color: "var(--accent)" }}
          >
            Browse the range
          </p>
          <h1
            className="text-2xl sm:text-3xl lg:text-[2.15rem] xl:text-4xl font-extrabold tracking-tight leading-[1.12] mb-0 lg:mb-3"
            style={{ color: "var(--foreground)" }}
          >
            Shop fresh food
          </h1>
          <p
            className="hidden lg:block text-sm sm:text-base leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            Explore Landar&apos;s Food products, filter by category, sort by price or name, and add items to your
            basket. Adjust your search anytime — your cart stays with you as you browse.
          </p>
          {showCounts && (
            <div className="hidden lg:flex mt-6 flex-wrap gap-3 sm:gap-4">
              <div
                className="inline-flex flex-col rounded-xl px-4 py-3 border"
                style={{
                  background: "var(--sidebar-bg)",
                  borderColor: "var(--sidebar-border)",
                }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                  In this storefront
                </span>
                <span className="text-lg font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
                  {productCount} product{productCount === 1 ? "" : "s"}
                </span>
              </div>
              {categoryCount !== undefined && categoryCount !== null ? (
                <div
                  className="inline-flex flex-col rounded-xl px-4 py-3 border"
                  style={{
                    background: "var(--sidebar-bg)",
                    borderColor: "var(--sidebar-border)",
                  }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    Categories
                  </span>
                  <span className="text-lg font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
                    {categoryCount}
                  </span>
                </div>
              ) : null}
            </div>
          )}
          {statsLoading && (
            <div
              className="hidden lg:flex mt-6 gap-3 animate-pulse"
              aria-busy
              aria-label="Loading shop stats"
            >
              <div className="h-[4.75rem] w-36 rounded-xl" style={{ background: "var(--sidebar-bg)" }} />
              <div className="h-[4.75rem] w-36 rounded-xl" style={{ background: "var(--sidebar-bg)" }} />
            </div>
          )}
        </div>

        <div className="shrink-0 w-full lg:w-auto lg:flex-[1.05] xl:flex-[1.1] lg:max-w-none">
          <ShopHeroSidePanel />
        </div>
      </div>
    </section>
  );
}
