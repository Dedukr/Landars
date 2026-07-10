"use client";

import React, { useEffect, useState } from "react";
import { fetchCategoryGroups } from "@/lib/fetchCategoryGroups";
import ShelfSection from "@/components/home/ShelfSection";
import CategoryDisplayGrid from "@/components/categories/CategoryDisplayGrid";
import {
  buildShopCarouselCategories,
  type HomeDisplayCategory,
} from "@/lib/prepareHomeDisplayCategories";

export default function CategoryGrid() {
  const [categories, setCategories] = useState<HomeDisplayCategory[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <ShelfSection
      title="Shop by category"
      subtitle="Browse"
      background="transparent"
      seeAllHref="/shop"
      seeAllLabel="See all products"
    >
      <CategoryDisplayGrid
        categories={categories}
        loading={loading}
        size="default"
        mode="link"
        ariaLabel="Shop by category"
        mobileScrollbar
      />
    </ShelfSection>
  );
}
