"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { buildCombinedCategoryShopHref } from "@/constants/homeCategoryGroups";
import { buildShopCategoryHref } from "@/lib/parseShopCategoryParams";
import ShelfSection from "@/components/home/ShelfSection";
import {
  prepareHomeDisplayCategories,
  type ApiCategory,
  type HomeDisplayCategory,
} from "@/lib/prepareHomeDisplayCategories";

type ProductImageCandidate = {
  image_url?: string | null;
  images?: Array<string | { image_url: string }>;
  primary_image?: string | null;
};

function getFirstImageUrl(product: ProductImageCandidate): string | null {
  if (product.primary_image) return product.primary_image;
  if (product.image_url) return product.image_url;
  if (product.images && product.images.length > 0) {
    const first = product.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "image_url" in first)
      return first.image_url;
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function CategoryCard({
  category,
  className = "",
}: {
  category: HomeDisplayCategory;
  className?: string;
}) {
  const href = category.combinedCategoryIds?.length
    ? buildCombinedCategoryShopHref(category.combinedCategoryIds)
    : buildShopCategoryHref({ categoryId: category.id });

  const subtitle =
    typeof category.products_count === "number" && category.products_count > 0
      ? `${category.products_count} item${category.products_count === 1 ? "" : "s"}`
      : null;

  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${className}`}
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="relative h-44 overflow-hidden flex-shrink-0"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={category.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package
              className="w-12 h-12 opacity-30"
              style={{ color: "var(--muted-foreground)" }}
              aria-hidden
            />
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4">
        <h3
          className="font-semibold text-sm leading-snug mb-1 whitespace-normal break-words"
          style={{ color: "var(--foreground)" }}
          title={category.name}
        >
          {category.name}
        </h3>

        {subtitle ? (
          <p
            className="text-xs leading-relaxed mb-2 flex-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            {subtitle}
          </p>
        ) : (
          <div className="mb-2 flex-1" />
        )}

        <div className="flex items-center justify-end mt-auto pt-2">
          <span
            className="inline-flex items-center gap-1 text-xs font-medium transition-opacity group-hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            View
            <ArrowRight className="w-3 h-3" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function CategoryGrid() {
  const [categories, setCategories] = useState<HomeDisplayCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [topSoldImageById, setTopSoldImageById] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    fetch("/api/categories/")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch categories");
        return r.json();
      })
      .then((data: ApiCategory[] | { results?: ApiCategory[] }) => {
        const list = Array.isArray(data) ? data : (data.results ?? []);
        setCategories(prepareHomeDisplayCategories(list));
      })
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (categories.length === 0) return;

    // Always re-fetch the current top-selling product image per category.
    // This prevents stale category pictures when products move between categories.
    const controller = new AbortController();

    async function run() {
      const next: Record<number, string> = {};

      for (const cat of categories) {
        try {
          const categoriesParam = cat.combinedCategoryIds?.length
            ? cat.combinedCategoryIds.join(",")
            : String(cat.id);

          const qs = new URLSearchParams({
            limit: "1",
            offset: "0",
            sort: "sales_desc",
            categories: categoriesParam,
            no_cache: "1",
          }).toString();

          const r = await fetch(`/api/products/?${qs}`, {
            signal: controller.signal,
          });
          if (!r.ok) continue;
          const data = await r.json();
          const results = Array.isArray(data) ? data : (data?.results ?? []);
          const first = results?.[0] as ProductImageCandidate | undefined;
          const url = first ? getFirstImageUrl(first) : null;
          if (url) next[cat.id] = url;
        } catch {
          // ignore; we'll fall back to category.image_url if present
        }
      }

      if (controller.signal.aborted) return;
      setTopSoldImageById(next);
    }

    void run();
    return () => controller.abort();
  }, [categories, loading]);

  const visibleCategories = useMemo(() => {
    const childrenOnly = categories.filter((c) => c.parent !== null);
    return childrenOnly.map((c) => {
      const topSold = topSoldImageById[c.id];
      if (topSold) return { ...c, image_url: topSold };
      return c;
    });
  }, [categories, topSoldImageById]);
  const pages = useMemo(() => chunk(visibleCategories, 8), [visibleCategories]);
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

  return (
    <ShelfSection
      title="Shop by category"
      subtitle="Browse"
      background="subtle"
      seeAllHref="/shop"
      seeAllLabel="See all products"
    >
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl animate-pulse"
              style={{
                height: "260px",
                background: "var(--card-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            />
          ))}
        </div>
      ) : visibleCategories.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          No categories available right now.
        </p>
      ) : (
        <>
          {isMobile ? (
            <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-2">
              <div className="flex gap-4 w-max lg:w-auto">
                {visibleCategories.map((cat) => (
                  <CategoryCard
                    key={cat.isCombined ? `combined-${cat.name}` : cat.id}
                    category={cat}
                    className="flex-shrink-0 w-44 sm:w-52"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="relative">
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
                    <ChevronLeft
                      className="h-5 w-5"
                      strokeWidth={2}
                      aria-hidden
                    />
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
                    <ChevronRight
                      className="h-5 w-5"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </>
              ) : null}

              <div
                ref={viewportRef}
                onScroll={syncPageIndexFromScroll}
                className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ WebkitOverflowScrolling: "touch" }}
                role="region"
                aria-label="Shop by category"
              >
                <div className="flex w-full">
                  {pages.map((page, idx) => (
                    <div key={idx} className="min-w-full w-full shrink-0">
                      <div className="grid grid-cols-4 gap-4">
                        {page.map((cat) => (
                          <CategoryCard
                            key={
                              cat.isCombined ? `combined-${cat.name}` : cat.id
                            }
                            category={cat}
                            className="w-auto"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {pageCount > 1 ? (
                <div
                  className="hidden lg:flex justify-center gap-2 mt-4"
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
                            i === pageIndex
                              ? "var(--primary)"
                              : "var(--sidebar-border)",
                        }}
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </ShelfSection>
  );
}
