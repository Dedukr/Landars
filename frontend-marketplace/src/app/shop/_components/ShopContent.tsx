"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProductGrid from "@/components/ProductGrid";
import { ShopPageHeader } from "@/components/shop/ShopPageHeader";
import { ShopHeroSidePanel } from "@/components/shop/ShopHeroSidePanel";
import CategoryDisplayGrid from "@/components/categories/CategoryDisplayGrid";
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
  SHOP_CATEGORY_SORT,
  SHOP_SORT_OPTIONS,
} from "@/components/shop/shop-sort-options";
import {
  type ShopListingFilters,
  SHOP_PRICE_MAX_UNLIMITED,
} from "@/types/shop-filters";
import { normalizeListResponse } from "@/components/shop/normalizeListResponse";
import { scopeProductsQueryString } from "@/utils/catalogScope";
import {
  parseShopCategoryParams,
  shopCategoryGroupIdFromParams,
  buildShopListingHref,
} from "@/lib/parseShopCategoryParams";
import { fetchPostDeliveryCategoryGroup } from "@/lib/postDeliveryCategoryGroup";
import { fetchCategoryGroups } from "@/lib/fetchCategoryGroups";
import {
  buildShopByCategoryDisplay,
  buildShopFilterPanelCategories,
  type ApiCategory,
} from "@/lib/prepareHomeDisplayCategories";
import type { PostDeliveryCategoryGroup } from "@/lib/postDeliveryCategoryGroup";

export default function ShopContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialSearchFromUrl = searchParams.get("q") ?? "";
  const urlParamsKey = searchParams.toString();

  const [filters, setFilters] = useState<ShopListingFilters>({
    categories: parseShopCategoryParams(searchParams),
    price: [0, SHOP_PRICE_MAX_UNLIMITED],
    inStock: false,
  });

  const [sort, setSort] = useState(SHOP_INITIAL_SORT);
  const [search, setSearch] = useState(initialSearchFromUrl);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const [categories, setCategories] = useState<ShopCategoryRecord[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [productCount, setProductCount] = useState<number | null>(null);
  const [categoryCount, setCategoryCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const previousSearchRef = useRef(search);

  const [categoryGroups, setCategoryGroups] = useState<
    Awaited<ReturnType<typeof fetchCategoryGroups>>
  >([]);
  const [postDeliveryGroup, setPostDeliveryGroup] =
    useState<PostDeliveryCategoryGroup | null>(null);

  useEffect(() => {
    fetchCategoryGroups().then(setCategoryGroups);
    fetchPostDeliveryCategoryGroup().then(setPostDeliveryGroup);
  }, []);

  const displayCategories = useMemo(() => {
    const apiList: ApiCategory[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      parent: c.parent ?? null,
      image_url: c.image_url ?? null,
      products_count: c.products_count ?? null,
      top_seller_sold_quantity: c.top_seller_sold_quantity ?? null,
    }));
    return buildShopByCategoryDisplay(apiList, categoryGroups);
  }, [categories, categoryGroups]);

  const filterPanelCategories = useMemo(
    () =>
      buildShopFilterPanelCategories(
        categories,
        categoryGroups,
        postDeliveryGroup
      ),
    [categories, categoryGroups, postDeliveryGroup]
  );

  /** Apply category (and search) filters when arriving from home carousel or other links. */
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(urlParamsKey);
    const searchFromUrl = params.get("q") ?? "";

    async function applyFromUrl() {
      let categoryIds = parseShopCategoryParams(params);

      if (!categoryIds.length) {
        const groupId = shopCategoryGroupIdFromParams(params);
        if (groupId) {
          const groups = await fetchCategoryGroups();
          const group = groups.find((g) => g.id === groupId);
          if (group?.category_ids?.length) {
            categoryIds = [...group.category_ids];
          }
        } else {
          const postFlag = params.get("post_delivery");
          if (postFlag === "1" || postFlag === "true" || postFlag === "yes") {
            const pd = await fetchPostDeliveryCategoryGroup();
            if (pd?.category_ids?.length) {
              categoryIds = [...pd.category_ids];
            }
          }
        }
      }

      if (cancelled) return;
      setFilters((prev) => ({
        ...prev,
        categories: categoryIds,
      }));
      setSearch(searchFromUrl);
    }

    void applyFromUrl();
    return () => {
      cancelled = true;
    };
  }, [urlParamsKey]);

  const categoryFilterKey = useMemo(
    () => [...filters.categories].sort((a, b) => a - b).join(","),
    [filters.categories]
  );

  /** Category filters show products grouped A–Z by category (not product name). */
  useEffect(() => {
    if (filters.categories.length > 0) {
      setSort(SHOP_CATEGORY_SORT);
      return;
    }
    setSort((current) =>
      current === SHOP_CATEGORY_SORT ? SHOP_INITIAL_SORT : current
    );
  }, [categoryFilterKey, filters.categories.length]);

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
          const apiList: ApiCategory[] = list.map((c) => ({
            id: c.id,
            name: c.name,
            parent: c.parent ?? null,
            image_url: c.image_url ?? null,
            products_count: c.products_count ?? null,
            top_seller_sold_quantity: c.top_seller_sold_quantity ?? null,
          }));
          const groups = await fetchCategoryGroups();
          cLen = buildShopByCategoryDisplay(apiList, groups).length;
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
      router.replace("/shop/", { scroll: false });
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
  }, [router]);

  useEffect(() => {
    const prev = previousSearchRef.current;
    previousSearchRef.current = search;

    if (typeof window === "undefined") return;
    if (!search.trim()) return;
    if (search === prev) return;

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [search]);

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.price[0] > 0 ||
    filters.price[1] < SHOP_PRICE_MAX_UNLIMITED ||
    filters.inStock ||
    search.length > 0 ||
    sort !== SHOP_INITIAL_SORT;

  const handleCategorySelect = useCallback(
    (categoryIds: number[], categoryGroupId?: number) => {
      setFilters((prev) => ({ ...prev, categories: categoryIds }));
      router.replace(
        buildShopListingHref({
          categoryIds: categoryGroupId ? undefined : categoryIds,
          categoryGroupId,
          q: search || undefined,
        }),
        { scroll: false }
      );
    },
    [router, search]
  );

  const resetAll = useCallback(() => {
    setFilters({
      categories: [],
      price: [0, SHOP_PRICE_MAX_UNLIMITED],
      inStock: false,
    });
    setSearch("");
    setSort(SHOP_INITIAL_SORT);
    router.replace("/shop/", { scroll: false });
  }, [router]);

  return (
    <div className="min-h-screen pb-16 sm:pb-10" style={{ background: "var(--background)" }}>
      <ShopMobileFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
      >
        <ShopFilterPanelContent
          filters={filters}
          setFilters={setFilters}
          categories={filterPanelCategories}
          categoriesLoading={categoriesLoading}
        />
      </ShopMobileFilterDrawer>

      <div className="px-3 sm:px-5 lg:px-10 pt-4 sm:pt-6 lg:content-offset-md">
        <div className="md:hidden mb-4">
          <ShopHeroSidePanel />
        </div>
        <div className="hidden md:block">
          <ShopPageHeader
            productCount={productCount}
            categoryCount={categoryCount}
            statsLoading={statsLoading}
          />
        </div>

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
            <CategoryDisplayGrid
              categories={displayCategories}
              loading={categoriesLoading}
              size="compact"
              mode="filter"
              activeCategoryIds={filters.categories}
              onCategorySelect={handleCategorySelect}
              ariaLabel="Filter by category"
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-start gap-8 lg:gap-10">
            <ShopDesktopFilterAside
              filters={filters}
              setFilters={setFilters}
              categories={filterPanelCategories}
              categoriesLoading={categoriesLoading}
            />

            <div className="flex-1 min-w-0 w-full">
              {hasActiveFilters && (
                <div className="flex justify-end mb-4">
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
                </div>
              )}

              <ProductGrid
                filters={filters}
                sort={sort}
                search={search}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
