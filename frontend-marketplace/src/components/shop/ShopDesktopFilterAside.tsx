"use client";

import React from "react";
import { SlidersHorizontal } from "lucide-react";
import { ShopFilterPanelContent } from "@/components/shop/ShopFilterPanelContent";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import type { ShopListingFilters } from "@/types/shop-filters";
import { Button } from "@/components/ui/Button";

interface ShopDesktopFilterAsideProps {
  filters: ShopListingFilters;
  setFilters: React.Dispatch<React.SetStateAction<ShopListingFilters>>;
  categories: ShopCategoryRecord[];
  categoriesLoading: boolean;
}

export function ShopDesktopFilterAside({
  filters,
  setFilters,
  categories,
  categoriesLoading,
}: ShopDesktopFilterAsideProps) {
  return (
    <aside
      className="hidden md:block shrink-0 self-start w-[min(100%,var(--sidebar-width))]"
      aria-label="Product filters"
    >
      <div
        className="sticky top-20 rounded-2xl border p-5 shadow-sm"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div className="flex items-center gap-2 mb-6">
          <SlidersHorizontal className="w-5 h-5 shrink-0" style={{ color: "var(--accent)" }} aria-hidden />
          <h2 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
            Refine results
          </h2>
        </div>
        <ShopFilterPanelContent
          filters={filters}
          setFilters={setFilters}
          categories={categories}
          categoriesLoading={categoriesLoading}
        />
      </div>
    </aside>
  );
}

interface ShopMobileFiltersTriggerProps {
  onClick: () => void;
}

export function ShopMobileFiltersTrigger({ onClick }: ShopMobileFiltersTriggerProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="shrink-0 flex items-center justify-center px-4 gap-2 min-h-[48px] border-2"
      style={{ borderColor: "var(--sidebar-border)" }}
      onClick={onClick}
      icon={<SlidersHorizontal className="w-5 h-5" aria-hidden />}
      iconPosition="left"
      aria-haspopup="dialog"
    >
      Filters
    </Button>
  );
}
