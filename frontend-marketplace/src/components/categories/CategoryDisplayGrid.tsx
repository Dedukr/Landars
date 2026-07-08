"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CategoryCard,
  categoryDisplayKey,
  isCategoryCardActive,
  type CategoryCardSize,
} from "@/components/categories/CategoryCard";
import type { HomeDisplayCategory } from "@/lib/prepareHomeDisplayCategories";

const GRID_CONFIG: Record<
  CategoryCardSize,
  {
    skeletonCount: number;
    gap: string;
    carouselCardW: string;
    skeletonH: string;
  }
> = {
  default: {
    skeletonCount: 8,
    gap: "gap-4",
    carouselCardW: "w-44 sm:w-52",
    skeletonH: "260px",
  },
  compact: {
    skeletonCount: 12,
    gap: "gap-1.5 lg:gap-2",
    carouselCardW: "w-20 sm:w-24 lg:w-28",
    skeletonH: "76px",
  },
};

function CategorySectionShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border p-3 sm:p-4 backdrop-blur-md",
        className
      )}
      style={{
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {children}
    </div>
  );
}

export interface CategoryDisplayGridProps {
  categories: HomeDisplayCategory[];
  loading?: boolean;
  size?: CategoryCardSize;
  mode?: "link" | "filter";
  activeCategoryIds?: number[];
  onCategorySelect?: (categoryIds: number[], categoryGroupId?: number) => void;
  ariaLabel?: string;
  className?: string;
}

export default function CategoryDisplayGrid({
  categories,
  loading = false,
  size = "default",
  mode = "link",
  activeCategoryIds = [],
  onCategorySelect,
  ariaLabel = "Browse categories",
  className,
}: CategoryDisplayGridProps) {
  const config = GRID_CONFIG[size];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showArrows, setShowArrows] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 2;
    setShowArrows(overflow);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    el.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [categories.length, loading, updateScrollState]);

  const scrollCarousel = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(240, Math.round(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (loading) {
    return (
      <CategorySectionShell className={className}>
        <div className={cn("flex w-max min-w-full", config.gap)}>
          {Array.from({ length: config.skeletonCount }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex-shrink-0 rounded-2xl animate-pulse",
                config.carouselCardW,
                size === "compact" && "min-h-[76px] lg:min-h-[112px]"
              )}
              style={{
                height: size === "compact" ? undefined : config.skeletonH,
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            />
          ))}
        </div>
      </CategorySectionShell>
    );
  }

  if (categories.length === 0) {
    return (
      <CategorySectionShell className={className}>
        <p className="text-sm text-center py-4" style={{ color: "var(--muted-foreground)" }}>
          No categories available right now.
        </p>
      </CategorySectionShell>
    );
  }

  const renderCard = (cat: HomeDisplayCategory, cardClassName?: string) => (
    <CategoryCard
      key={categoryDisplayKey(cat)}
      category={cat}
      size={size}
      mode={mode}
      isActive={isCategoryCardActive(cat, activeCategoryIds)}
      onSelect={onCategorySelect}
      className={cardClassName}
    />
  );

  return (
    <CategorySectionShell className={className}>
      <div className="relative min-w-0">
        {showArrows ? (
          <>
            <button
              type="button"
              aria-label="Scroll categories left"
              onClick={() => scrollCarousel(-1)}
              disabled={!canScrollLeft}
              className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full border shadow-md disabled:pointer-events-none disabled:opacity-30"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                color: "var(--foreground)",
              }}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Scroll categories right"
              onClick={() => scrollCarousel(1)}
              disabled={!canScrollRight}
              className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full border shadow-md disabled:pointer-events-none disabled:opacity-30"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                color: "var(--foreground)",
              }}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </>
        ) : null}

        <div
          ref={scrollRef}
          className="w-full max-w-full min-w-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
          role="region"
          aria-label={ariaLabel}
        >
          <div className={cn("flex w-max", config.gap)}>
            {categories.map((cat) =>
              renderCard(cat, cn("flex-shrink-0", config.carouselCardW))
            )}
          </div>
        </div>
      </div>
    </CategorySectionShell>
  );
}
