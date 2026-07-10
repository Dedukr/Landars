"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchCategoryGroups } from "@/lib/fetchCategoryGroups";
import ShelfSection from "@/components/home/ShelfSection";
import CategoryDisplayGrid from "@/components/categories/CategoryDisplayGrid";
import {
  buildShopCarouselCategories,
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

export default function CategoryGrid() {
  const [categories, setCategories] = useState<HomeDisplayCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [topSoldImageById, setTopSoldImageById] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    Promise.all([
      fetch("/api/categories/").then((r) => {
        if (!r.ok) throw new Error("Failed to fetch categories");
        return r.json();
      }),
      fetchCategoryGroups(),
    ])
      .then(([data, groups]) => {
        const list = Array.isArray(data) ? data : (data.results ?? []);
        setCategories(buildShopCarouselCategories(list, groups));
      })
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (categories.length === 0) return;

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
          // ignore; fall back to category.image_url
        }
      }

      if (controller.signal.aborted) return;
      setTopSoldImageById(next);
    }

    void run();
    return () => controller.abort();
  }, [categories, loading]);

  const visibleCategories = useMemo(() => {
    return categories.map((c) => {
      // Prefer the category/group's own image; fall back to top-sold product image.
      if (c.image_url) return c;
      const topSold = topSoldImageById[c.id];
      if (topSold) return { ...c, image_url: topSold };
      return c;
    });
  }, [categories, topSoldImageById]);

  return (
    <ShelfSection
      title="Shop by category"
      subtitle="Browse"
      background="transparent"
      seeAllHref="/shop"
      seeAllLabel="See all products"
    >
      <CategoryDisplayGrid
        categories={visibleCategories}
        loading={loading}
        size="default"
        mode="link"
        ariaLabel="Shop by category"
        mobileScrollbar
      />
    </ShelfSection>
  );
}
