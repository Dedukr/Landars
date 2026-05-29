"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CategoryCard,
  categoryDisplayKey,
  isCategoryCardActive,
  type CategoryCardSize,
} from "@/components/categories/CategoryCard";
import type { HomeDisplayCategory } from "@/lib/prepareHomeDisplayCategories";

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const GRID_CONFIG: Record<
  CategoryCardSize,
  {
    itemsPerPage: number;
    gridCols: string;
    gap: string;
    mobileCardW: string;
    skeletonH: string;
    mobileScrollPad: string;
  }
> = {
  default: {
    itemsPerPage: 8,
    gridCols: "grid-cols-4",
    gap: "gap-4",
    mobileCardW: "w-44 sm:w-52",
    skeletonH: "260px",
    mobileScrollPad: "-mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0",
  },
  compact: {
    itemsPerPage: 20,
    gridCols: "grid-cols-6 sm:grid-cols-8 lg:grid-cols-10",
    gap: "gap-1.5 lg:gap-2",
    mobileCardW: "w-20",
    skeletonH: "76px",
    mobileScrollPad: "-mx-1 px-1 sm:-mx-2 sm:px-2 lg:mx-0 lg:px-0",
  },
};

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
  const [isMobile, setIsMobile] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const pages = useMemo(
    () => chunk(categories, config.itemsPerPage),
    [categories, config.itemsPerPage]
  );
  const pageCount = pages.length;

  useEffect(() => {
    setPageIndex((i) => (pageCount === 0 ? 0 : Math.min(i, pageCount - 1)));
  }, [pageCount]);

  const scrollToPage = (index: number) => {
    const el = viewportRef.current;
    if (!el || pageCount === 0) return;
    const next = Math.max(0, Math.min(index, pageCount - 1));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setPageIndex(next);
  };

  const syncPageIndexFromScroll = () => {
    const el = viewportRef.current;
    if (!el || pageCount === 0) return;
    const width = el.clientWidth;
    if (width <= 0) return;
    const next = Math.round(el.scrollLeft / width);
    setPageIndex(Math.max(0, Math.min(next, pageCount - 1)));
  };

  if (loading) {
    return (
      <div
        className={cn(
          "grid",
          size === "compact"
            ? "grid-cols-4 sm:grid-cols-6 lg:grid-cols-10"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
          config.gap,
          className
        )}
      >
        {Array.from({ length: config.itemsPerPage }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl animate-pulse",
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
    );
  }

  if (categories.length === 0) {
    return (
      <p className={cn("text-sm", className)} style={{ color: "var(--muted-foreground)" }}>
        No categories available right now.
      </p>
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

  if (isMobile) {
    return (
      <div className={cn("overflow-x-auto pb-2", config.mobileScrollPad, className)}>
        <div className="flex gap-1.5 w-max lg:w-auto">
          {categories.map((cat) =>
            renderCard(cat, cn("flex-shrink-0", config.mobileCardW))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {pageCount > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous categories"
            onClick={() => scrollToPage(pageIndex - 1)}
            disabled={pageIndex <= 0}
            className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full border shadow-md disabled:opacity-30"
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
            aria-label="Next categories"
            onClick={() => scrollToPage(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1}
            className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full border shadow-md disabled:opacity-30"
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
        ref={viewportRef}
        onScroll={syncPageIndexFromScroll}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
        role="region"
        aria-label={ariaLabel}
      >
        <div className="flex w-full">
          {pages.map((page, idx) => (
            <div key={idx} className="min-w-full w-full shrink-0">
              <div className={cn("grid", config.gridCols, config.gap)}>
                {page.map((cat) => renderCard(cat, "w-auto"))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pageCount > 1 ? (
        <div
          className="hidden lg:flex justify-center gap-2 mt-3"
          role="tablist"
          aria-label="Category pages"
        >
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-label={`Page ${i + 1} of ${pageCount}`}
              aria-selected={i === pageIndex}
              onClick={() => scrollToPage(i)}
              className="flex h-9 w-9 items-center justify-center rounded-sm"
            >
              <span
                className={`block h-1 rounded-sm transition-all ${i === pageIndex ? "w-8" : "w-5 opacity-50"}`}
                style={{
                  background:
                    i === pageIndex ? "var(--primary)" : "var(--sidebar-border)",
                }}
                aria-hidden
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
