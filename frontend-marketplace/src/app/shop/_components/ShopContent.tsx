"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import ProductGrid, { type ShopListingMeta } from "@/components/ProductGrid";
import { ShopPageHeader } from "@/components/shop/ShopPageHeader";
import { ShopCategoryChips } from "@/components/shop/ShopCategoryChips";
import { ShopSearchBar } from "@/components/shop/ShopSearchBar";
import {
  ShopDesktopFilterAside,
  ShopMobileFiltersTrigger,
} from "@/components/shop/ShopDesktopFilterAside";
import { ShopMobileFilterDrawer } from "@/components/shop/ShopMobileFilterDrawer";
import { ShopFilterPanelContent } from "@/components/shop/ShopFilterPanelContent";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import {
  SHOP_INITIAL_SORT,
  SHOP_SORT_OPTIONS,
} from "@/components/shop/shop-sort-options";
import {
  type ShopListingFilters,
  SHOP_PRICE_MAX_UNLIMITED,
} from "@/types/shop-filters";
import { normalizeListResponse } from "@/components/shop/normalizeListResponse";
import { countLeafShopCategories } from "@/components/shop/countLeafShopCategories";
import { scopeProductsQueryString } from "@/utils/catalogScope";

export default function ShopContent() {
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category");
  const rawSearch = searchParams.get("q") || "";

  const [filters, setFilters] = useState<ShopListingFilters>({
    categories: rawCategory ? [parseInt(rawCategory, 10)] : [],
    price: [0, SHOP_PRICE_MAX_UNLIMITED],
    inStock: false,
  });

  const [sort, setSort] = useState(SHOP_INITIAL_SORT);
  const [search, setSearch] = useState(rawSearch);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const [categories, setCategories] = useState<ShopCategoryRecord[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [productCount, setProductCount] = useState<number | null>(null);
  const [categoryCount, setCategoryCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [listingMeta, setListingMeta] = useState<ShopListingMeta | null>(null);

  useEffect(() => {
    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const res = await fetch("/api/categories/");
        if (!res.ok) throw new Error("categories");
        const data = await res.json();
        setCategories(normalizeListResponse<ShopCategoryRecord>(data));
      } catch {
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      setStatsLoading(true);
      try {
        const qs = scopeProductsQueryString(
          new URLSearchParams({ limit: "1", offset: "0" }).toString()
        );
        const [pres, cres] = await Promise.all([
          fetch(`/api/products/?${qs}`),
          fetch("/api/categories/"),
        ]);
        if (cancelled) return;
        let pCount: number | null = null;
        if (pres.ok) {
          const pdata = await pres.json();
          if (pdata && typeof pdata.count === "number") pCount = pdata.count;
        }
        let cLen: number | null = null;
        if (cres.ok) {
          const cdata = await cres.json();
          const list = normalizeListResponse<ShopCategoryRecord>(cdata);
          cLen = countLeafShopCategories(list);
        }
        setProductCount(pCount);
        setCategoryCount(cLen);
      } catch {
        if (!cancelled) {
          setProductCount(null);
          setCategoryCount(null);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleGlobalSearch(e: CustomEvent<string>) {
      if (e.detail !== undefined) setSearch(e.detail);
    }
    function handleClearFilters() {
      setFilters({
        categories: [],
        price: [0, SHOP_PRICE_MAX_UNLIMITED],
        inStock: false,
      });
      setSearch("");
      setSort(SHOP_INITIAL_SORT);
    }

    window.addEventListener(
      "product-search",
      handleGlobalSearch as EventListener
    );
    window.addEventListener("clear-filters", handleClearFilters as EventListener);

    return () => {
      window.removeEventListener(
        "product-search",
        handleGlobalSearch as EventListener
      );
      window.removeEventListener(
        "clear-filters",
        handleClearFilters as EventListener
      );
    };
  }, []);

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.price[0] > 0 ||
    filters.price[1] < SHOP_PRICE_MAX_UNLIMITED ||
    filters.inStock ||
    search.length > 0 ||
    sort !== SHOP_INITIAL_SORT;

  const resetAll = useCallback(() => {
    setFilters({
      categories: [],
      price: [0, SHOP_PRICE_MAX_UNLIMITED],
      inStock: false,
    });
    setSearch("");
    setSort(SHOP_INITIAL_SORT);
  }, []);

  return (
    <div className="min-h-screen pb-16 sm:pb-10" style={{ background: "var(--background)" }}>
      <ShopMobileFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
      >
        <ShopFilterPanelContent
          filters={filters}
          setFilters={setFilters}
          categories={categories}
          categoriesLoading={categoriesLoading}
        />
      </ShopMobileFilterDrawer>

      <div className="px-3 sm:px-5 lg:px-10 pt-4 sm:pt-6 lg:content-offset-md">
        <ShopPageHeader
          productCount={productCount}
          categoryCount={categoryCount}
          statsLoading={statsLoading}
        />

        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Shop" }]} />

        <div
          className="mt-4 rounded-2xl border px-4 py-5 sm:px-6 sm:py-6 shadow-sm mb-8"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--sidebar-border)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <ShopSearchBar
            search={search}
            setSearch={setSearch}
            sort={sort}
            setSort={setSort}
            sortOptions={SHOP_SORT_OPTIONS}
            mobileFilterSlot={
              <ShopMobileFiltersTrigger onClick={() => setFilterDrawerOpen(true)} />
            }
          />

          <div className="mt-4 mb-6">
            <ShopCategoryChips
              categories={categories}
              filters={filters}
              setFilters={setFilters}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-start gap-8 lg:gap-10">
            <ShopDesktopFilterAside
              filters={filters}
              setFilters={setFilters}
              categories={categories}
              categoriesLoading={categoriesLoading}
            />

            <div className="flex-1 min-w-0 w-full">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2
                  className="text-lg sm:text-xl font-bold"
                  style={{ color: "var(--foreground)" }}
                >
                  {hasActiveFilters ? "Filtered selection" : "All products"}
                </h2>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="text-sm font-semibold px-3 py-2 rounded-lg border transition-opacity hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    style={{
                      borderColor: "var(--sidebar-border)",
                      color: "var(--accent)",
                      background: "var(--sidebar-bg)",
                    }}
                    onClick={resetAll}
                  >
                    Reset filters
                  </button>
                )}
              </div>

              {listingMeta &&
                !listingMeta.loading &&
                listingMeta.totalCount > 0 && (
                  <p
                    className="text-xs sm:text-sm mb-4"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {listingMeta.displayedCount} on screen · {listingMeta.totalCount}{" "}
                    in this view
                    {listingMeta.hasMoreRemote
                      ? " · more load as you scroll"
                      : ""}
                  </p>
                )}

              <ProductGrid
                filters={filters}
                sort={sort}
                search={search}
                onListingMeta={setListingMeta}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
