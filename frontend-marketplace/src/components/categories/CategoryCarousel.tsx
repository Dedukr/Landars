"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Utensils,
  Beef,
  Soup,
  Cookie,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCombinedCategoryShopHref } from "@/constants/homeCategoryGroups";
import { buildShopCategoryHref } from "@/lib/parseShopCategoryParams";
import type { HomeDisplayCategory } from "@/lib/prepareHomeDisplayCategories";
import {
  chunkCategories,
  getCategoryFilterIds,
  getColumnsForWidth,
  isCategoryFilterActive,
} from "@/lib/categoryCarouselUtils";

function getCategoryIcon(category: HomeDisplayCategory): React.ElementType {
  if (category.isCombined) return Beef;
  const lc = category.name.toLowerCase();
  if (lc.includes("dumpling") || lc.includes("varenyky")) return Cookie;
  if (lc.includes("lard")) return Utensils;
  if (lc.includes("meat snack") || lc.includes("snack")) return Beef;
  if (lc.includes("sausage") || lc.includes("barbecue")) return Beef;
  if (lc.includes("soup")) return Soup;
  return Utensils;
}

function CategoryCarouselShell({
  children,
  className,
  panelTone = "sidebar",
}: {
  children: React.ReactNode;
  className?: string;
  panelTone?: "sidebar" | "card";
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-2xl border p-4 sm:p-5", className)}
      style={{
        background: panelTone === "card" ? "var(--card-bg)" : "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: panelTone === "card" ? "var(--card-shadow)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

const carouselArrowClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-md transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-30 sm:h-10 sm:w-10";

function CategoryCarouselPageIndicators({
  pageCount,
  pageIndex,
  onSelect,
  className,
}: {
  pageCount: number;
  pageIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      role="tablist"
      aria-label="Category pages"
    >
      {Array.from({ length: pageCount }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === pageIndex}
          aria-label={`Page ${i + 1} of ${pageCount}`}
          onClick={() => onSelect(i)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <span
            className={cn(
              "block h-1 rounded-sm transition-all sm:h-1",
              i === pageIndex ? "w-8" : "w-5 opacity-50"
            )}
            style={{
              background:
                i === pageIndex ? "var(--primary)" : "var(--sidebar-border)",
            }}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

function CategoryCarouselSkeleton({ cols }: { cols: number }) {
  const count = cols * 2;
  return (
    <div
      className="grid min-w-0 gap-3 sm:gap-4"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: "repeat(2, minmax(7.5rem, auto))",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="min-h-[7.5rem] min-w-0 animate-pulse rounded-2xl sm:min-h-[8rem]"
          style={{ background: "var(--card-bg)" }}
        />
      ))}
    </div>
  );
}

interface CategoryTileProps {
  category: HomeDisplayCategory;
  mode: "link" | "filter";
  isActive?: boolean;
  onSelect?: (categoryIds: number[]) => void;
  panelTone?: "sidebar" | "card";
}

function CategoryTile({
  category,
  mode,
  isActive = false,
  onSelect,
  panelTone = "sidebar",
}: CategoryTileProps) {
  const Icon = getCategoryIcon(category);
  const filterIds = getCategoryFilterIds(category);

  const cardClass = cn(
    "group flex h-full min-h-[7.5rem] w-full max-w-full min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border p-3 transition-all duration-200 sm:min-h-[8rem] sm:p-4",
    mode === "filter" && "cursor-pointer text-left",
    isActive ? "ring-2 ring-[var(--primary)]" : undefined
  );

  const tileBg =
    panelTone === "card" ? "var(--sidebar-bg)" : "var(--card-bg)";
  const cardStyle = {
    background: isActive ? "var(--sidebar-bg)" : tileBg,
    borderColor: isActive ? "var(--primary)" : "var(--sidebar-border)",
  };

  const inner = (
    <>
      <div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors duration-200"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={category.name}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <Icon
            className="h-7 w-7 transition-colors duration-200"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
        )}
      </div>
      <div className="w-full min-w-0 px-0.5 text-center">
        <span
          className="block text-sm font-semibold leading-tight line-clamp-2 break-words"
          style={{ color: "var(--foreground)" }}
        >
          {category.name}
        </span>
        {typeof category.products_count === "number" &&
          category.products_count > 0 && (
            <span
              className="mt-1 inline-block text-[10px] font-medium"
              style={{ color: "var(--muted-foreground)" }}
            >
              {category.products_count} item
              {category.products_count !== 1 ? "s" : ""}
            </span>
          )}
      </div>
    </>
  );

  if (mode === "link") {
    const href = category.combinedCategoryIds?.length
      ? buildCombinedCategoryShopHref(category.combinedCategoryIds)
      : buildShopCategoryHref({ categoryId: category.id });

    return (
      <Link href={href} className={cardClass} style={cardStyle}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={cardClass}
      style={cardStyle}
      aria-pressed={isActive}
      aria-label={`Filter by ${category.name}`}
      onClick={() => {
        if (isActive) {
          onSelect?.([]);
        } else {
          onSelect?.(filterIds);
        }
      }}
    >
      {inner}
    </button>
  );
}

export interface CategoryCarouselProps {
  categories: HomeDisplayCategory[];
  loading?: boolean;
  /** `link` navigates to shop; `filter` applies category filter on the shop page. */
  mode?: "link" | "filter";
  /** Visual / interaction style. `pagedGrid` is the existing 2-row paged grid. */
  layout?: "pagedGrid" | "shelfRow";
  activeCategoryIds?: number[];
  onCategorySelect?: (categoryIds: number[]) => void;
  className?: string;
  ariaLabel?: string;
  /** `card` on cream sections; `sidebar` when nested in a white card (e.g. shop). */
  panelTone?: "sidebar" | "card";
}

export default function CategoryCarousel({
  categories,
  loading = false,
  mode = "link",
  layout = "pagedGrid",
  activeCategoryIds = [],
  onCategorySelect,
  className,
  ariaLabel = "Browse categories",
  panelTone = "sidebar",
}: CategoryCarouselProps) {
  const [columns, setColumns] = useState(2);
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setColumns(getColumnsForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const itemsPerSlide = columns * 2;
  const pages = useMemo(
    () => chunkCategories(categories, itemsPerSlide),
    [categories, itemsPerSlide]
  );
  const pageCount = pages.length;

  useEffect(() => {
    setPageIndex((i) => (pageCount === 0 ? 0 : Math.min(i, pageCount - 1)));
  }, [pageCount, columns]);

  const scrollToPage = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el || pageCount === 0) return;
      const next = Math.max(0, Math.min(index, pageCount - 1));
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
      setPageIndex(next);
    },
    [pageCount]
  );

  const syncPageIndexFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageCount === 0) return;
    const width = el.clientWidth;
    if (width <= 0) return;
    const next = Math.round(el.scrollLeft / width);
    setPageIndex(Math.max(0, Math.min(next, pageCount - 1)));
  }, [pageCount]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pageCount <= 1) return;

    const onScroll = () => syncPageIndexFromScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScroll);

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScroll);
    };
  }, [pageCount, syncPageIndexFromScroll]);

  const showArrows = pageCount > 1;

  if (loading) {
    return (
      <div className={cn("min-w-0", className)}>
        <CategoryCarouselShell panelTone={panelTone}>
          <CategoryCarouselSkeleton cols={columns} />
        </CategoryCarouselShell>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <CategoryCarouselShell className={className} panelTone={panelTone}>
        <p className="text-sm text-center py-6" style={{ color: "var(--muted-foreground)" }}>
          No categories available right now.
        </p>
      </CategoryCarouselShell>
    );
  }

  if (layout === "shelfRow") {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-2">
          <div className="flex gap-4 w-max lg:w-auto">
            {categories.map((cat) => (
              <div key={cat.isCombined ? `combined-${cat.name}` : cat.id} className="w-44 sm:w-52">
                <CategoryTile
                  category={cat}
                  mode={mode}
                  panelTone={panelTone}
                  isActive={isCategoryFilterActive(cat, activeCategoryIds)}
                  onSelect={onCategorySelect}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <CategoryCarouselShell panelTone={panelTone}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {showArrows ? (
            <button
              type="button"
              aria-label="Previous categories"
              onClick={() => scrollToPage(pageIndex - 1)}
              disabled={pageIndex <= 0}
              className={carouselArrowClass}
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                color: "var(--foreground)",
              }}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}

          <div
            ref={scrollRef}
            onScroll={syncPageIndexFromScroll}
            className={cn(
              "min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain",
              "flex max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            )}
            style={{ WebkitOverflowScrolling: "touch" }}
            role="region"
            aria-roledescription="carousel"
            aria-label={ariaLabel}
          >
            {pages.map((page, pageIdx) => (
              <div
                key={pageIdx}
                className="box-border w-full max-w-full min-w-full shrink-0 snap-start snap-always"
                aria-hidden={pageIdx !== pageIndex}
              >
                <div
                  className="grid min-w-0 gap-3 sm:gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gridTemplateRows: "repeat(2, minmax(7.5rem, auto))",
                  }}
                >
                  {page.map((cat) => (
                    <div
                      key={cat.isCombined ? `combined-${cat.name}` : cat.id}
                      className="min-w-0 h-full"
                    >
                      <CategoryTile
                        category={cat}
                        mode={mode}
                        panelTone={panelTone}
                        isActive={isCategoryFilterActive(cat, activeCategoryIds)}
                        onSelect={onCategorySelect}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {showArrows ? (
            <button
              type="button"
              aria-label="Next categories"
              onClick={() => scrollToPage(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
              className={carouselArrowClass}
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                color: "var(--foreground)",
              }}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
      </CategoryCarouselShell>

      <CategoryCarouselPageIndicators
        pageCount={pageCount}
        pageIndex={pageIndex}
        onSelect={scrollToPage}
        className="mt-3 sm:mt-4"
      />
    </div>
  );
}
