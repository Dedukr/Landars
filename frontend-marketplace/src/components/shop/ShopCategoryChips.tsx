"use client";

import React, { useMemo } from "react";
import type { ShopListingFilters } from "@/types/shop-filters";
import type { ShopCategoryRecord } from "./ShopFilterPanelContent";
import { resolveShopFeaturedCategories } from "@/constants/shopCategoryChips";
import { cn } from "@/lib/utils";

interface ShopCategoryChipsProps {
  categories: ShopCategoryRecord[];
  filters: ShopListingFilters;
  setFilters: React.Dispatch<React.SetStateAction<ShopListingFilters>>;
  className?: string;
}

export function ShopCategoryChips({
  categories,
  filters,
  setFilters,
  className,
}: ShopCategoryChipsProps) {
  const chips = useMemo(
    () => resolveShopFeaturedCategories(categories),
    [categories]
  );

  if (chips.length === 0) return null;

  function toggle(id: number) {
    setFilters((prev) => {
      const active = prev.categories.includes(id);
      const next = active
        ? prev.categories.filter((c) => c !== id)
        : [...prev.categories, id];
      return { ...prev, categories: next };
    });
  }

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex flex-wrap gap-2"
        role="listbox"
        aria-label="Filter by category"
      >
        {chips.map((c) => {
          const selected = filters.categories.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => toggle(c.id)}
              className={cn(
                "px-4 py-2.5 rounded-full text-sm font-semibold transition-all border",
                "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              )}
              style={{
                background: selected ? "var(--btn-primary)" : "var(--card-bg)",
                color: selected ? "var(--btn-primary-fg)" : "var(--foreground)",
                borderColor: selected ? "transparent" : "var(--sidebar-border)",
                boxShadow: selected ? "var(--card-shadow)" : "none",
              }}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
