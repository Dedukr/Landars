"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCombinedCategoryShopHref } from "@/constants/homeCategoryGroups";
import { buildShopCategoryHref } from "@/lib/parseShopCategoryParams";
import {
  getCategoryFilterIds,
  isCategoryFilterActive,
} from "@/lib/categoryCarouselUtils";
import type { HomeDisplayCategory } from "@/lib/prepareHomeDisplayCategories";

export type CategoryCardSize = "default" | "compact";

const SIZE_STYLES: Record<
  CategoryCardSize,
  {
    rounded: string;
    imageH: string;
    bodyP: string;
    title: string;
    subtitle: string;
    view: string;
    arrow: string;
    placeholderIcon: string;
    showMeta: boolean;
  }
> = {
  default: {
    rounded: "rounded-2xl",
    imageH: "h-44",
    bodyP: "p-4",
    title: "text-sm",
    subtitle: "text-xs",
    view: "text-xs",
    arrow: "w-3 h-3",
    placeholderIcon: "w-12 h-12",
    showMeta: true,
  },
  compact: {
    rounded: "rounded-md",
    imageH: "h-12 lg:h-[4.5rem]",
    bodyP: "px-1 py-1 lg:px-2 lg:py-2",
    title: "text-[9px] lg:text-[10px] leading-tight line-clamp-2",
    subtitle: "text-[8px] lg:text-[9px]",
    view: "text-[8px]",
    arrow: "w-2 h-2",
    placeholderIcon: "w-4 h-4 lg:w-5 lg:h-5",
    showMeta: false,
  },
};

export function categoryDisplayKey(category: HomeDisplayCategory): string {
  if (category.isCategoryGroup) return `group-${-category.id}`;
  if (category.isCombined) return `combined-${category.name}`;
  return String(category.id);
}

export interface CategoryCardProps {
  category: HomeDisplayCategory;
  size?: CategoryCardSize;
  mode?: "link" | "filter";
  isActive?: boolean;
  onSelect?: (categoryIds: number[], categoryGroupId?: number) => void;
  className?: string;
}

export function CategoryCard({
  category,
  size = "default",
  mode = "link",
  isActive = false,
  onSelect,
  className = "",
}: CategoryCardProps) {
  const s = SIZE_STYLES[size];
  const filterIds = getCategoryFilterIds(category);

  const subtitle =
    typeof category.products_count === "number" && category.products_count > 0
      ? `${category.products_count} item${category.products_count === 1 ? "" : "s"}`
      : null;

  const cardClass = cn(
    "group flex flex-col border overflow-hidden transition-all duration-200",
    s.rounded,
    mode === "filter" ? "cursor-pointer text-left w-full" : "hover:shadow-lg hover:-translate-y-0.5",
    isActive && mode === "filter"
      ? size === "compact"
        ? "ring-1 ring-[var(--primary)]"
        : "ring-2 ring-[var(--primary)]"
      : undefined,
    className
  );

  const cardStyle = {
    background: isActive ? "var(--sidebar-bg)" : "var(--card-bg)",
    borderColor: isActive ? "var(--primary)" : "var(--sidebar-border)",
  };

  const inner = (
    <>
      <div
        className={cn("relative overflow-hidden flex-shrink-0", s.imageH)}
        style={{ background: "var(--sidebar-bg)" }}
      >
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={category.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes={
              size === "compact"
                ? "(max-width: 640px) 20vw, 10vw"
                : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            }
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package
              className={cn(s.placeholderIcon, "opacity-30")}
              style={{ color: "var(--muted-foreground)" }}
              aria-hidden
            />
          </div>
        )}
      </div>

      <div className={cn("flex flex-col flex-1", s.bodyP)}>
        <h3
          className={cn(
            "font-semibold whitespace-normal break-words",
            s.showMeta ? "leading-snug mb-0.5" : "mb-0",
            s.title
          )}
          style={{ color: "var(--foreground)" }}
          title={category.name}
        >
          {category.name}
        </h3>

        {s.showMeta && subtitle ? (
          <p
            className={cn("leading-relaxed mb-1.5 flex-1", s.subtitle)}
            style={{ color: "var(--muted-foreground)" }}
          >
            {subtitle}
          </p>
        ) : s.showMeta ? (
          <div className="mb-1.5 flex-1" />
        ) : null}

        {s.showMeta ? (
          <div className="flex items-center justify-end mt-auto pt-1">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium transition-opacity group-hover:opacity-70",
                s.view
              )}
              style={{ color: "var(--accent)" }}
            >
              {mode === "filter" && isActive ? "Selected" : "View"}
              {mode === "link" || !isActive ? (
                <ArrowRight className={s.arrow} aria-hidden />
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );

  if (mode === "filter") {
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
            onSelect?.(filterIds, category.categoryGroupId);
          }
        }}
      >
        {inner}
      </button>
    );
  }

  const href = category.combinedCategoryIds?.length
    ? buildCombinedCategoryShopHref(
        category.combinedCategoryIds,
        category.categoryGroupId
      )
    : buildShopCategoryHref({ categoryId: category.id });

  return (
    <Link href={href} className={cardClass} style={cardStyle}>
      {inner}
    </Link>
  );
}

export function isCategoryCardActive(
  category: HomeDisplayCategory,
  activeCategoryIds: number[]
): boolean {
  return isCategoryFilterActive(category, activeCategoryIds);
}
