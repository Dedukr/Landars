"use client";

import React from "react";
import { Leaf, Search, ShoppingBag, Sparkles } from "lucide-react";

/**
 * Decorative marketplace hero — UI-focused overview only (no promises).
 */
export function ShopHeroSidePanel() {
  return (
    <div className="relative w-full lg:max-w-[min(100%,420px)] xl:max-w-[440px] mx-auto lg:mx-0 lg:ml-auto">
      {/* Ambient */}
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-72 w-72 rounded-full opacity-[0.15] blur-3xl"
        style={{ background: "var(--primary)" }}
      />
      <div
        className="pointer-events-none absolute -right-8 top-12 h-48 w-48 rounded-full opacity-25 blur-2xl"
        style={{ background: "var(--accent)" }}
      />

      <div
        className="rounded-2xl border p-6 sm:p-7 overflow-hidden relative shadow-md"
        style={{
            borderColor: "var(--sidebar-border)",
            background: `linear-gradient(
              155deg,
              color-mix(in srgb, var(--accent) 18%, transparent) 0%,
              var(--card-bg) 48%,
              color-mix(in srgb, var(--sidebar-bg) 85%, transparent) 100%
            )`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, var(--sidebar-border) 1px, transparent 0)`,
              backgroundSize: "22px 22px",
              maskImage: "linear-gradient(180deg, black 60%, transparent 100%)",
            }}
          />

          <div className="relative flex items-start gap-5">
            <div
              className="flex shrink-0 h-14 w-14 items-center justify-center rounded-2xl border shadow-sm"
              style={{
                borderColor: "color-mix(in srgb, var(--accent) 35%, var(--sidebar-border))",
                background: "var(--sidebar-bg)",
                color: "var(--accent)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <Sparkles className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em] mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Shop flow
              </p>
              <p
                className="text-lg sm:text-xl font-bold leading-snug mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Browse, refine, fill your basket
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                Narrow the list with search and filters, reorder it with sorting, then add products from each card or
                the product detail page.
              </p>
            </div>
          </div>

          {/* Decorative food-forward icons */}
          <div className="relative mt-8 flex justify-end gap-2 sm:gap-3 pr-1 opacity-85">
            {[
              { Icon: Leaf, rot: "-6deg" },
              { Icon: Search, rot: "4deg" },
              { Icon: ShoppingBag, rot: "-3deg" },
            ].map(({ Icon, rot }, i) => (
              <div
                key={i}
                className="flex h-12 w-12 sm:h-[3.35rem] sm:w-[3.35rem] items-center justify-center rounded-2xl border"
                style={{
                  transform: `rotate(${rot})`,
                  borderColor: "var(--sidebar-border)",
                  background: "color-mix(in srgb, var(--card-bg) 92%, var(--accent) 8%)",
                  color: "var(--muted-foreground)",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
                }}
              >
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.65} aria-hidden />
              </div>
            ))}
          </div>
        </div>

      <span className="sr-only">
        Decorative panel: overview of browsing, refining, and basket behaviour on the shop page.
      </span>
    </div>
  );
}
