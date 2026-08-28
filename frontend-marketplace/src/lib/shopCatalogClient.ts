import { scopeProductsQueryString } from "@/utils/catalogScope";
import type { ShopListingFilters } from "@/types/shop-filters";
import { SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import type { ShopProductDto } from "@/components/shop/ShopProductCard";
import {
  shopFilterGroupParentId,
  type ApiCategoryGroup,
} from "@/lib/prepareHomeDisplayCategories";

export const SHOP_PAGE_SIZE = 50;

export type ShopCatalogProduct = ShopProductDto & {
  sold_quantity?: number;
  sold_orders_count?: number;
};

interface PaginatedProductsResponse {
  results: ShopCatalogProduct[];
  count: number;
  next: string | null;
}

export interface ShopProductsQuery {
  filters: ShopListingFilters;
  sort: string;
  search?: string;
  limit: number;
  offset: number;
  categoryGroups?: ApiCategoryGroup[];
}

export interface ShopProductsPage {
  results: ShopCatalogProduct[];
  count: number;
  hasMore: boolean;
}

function mainImageUrl(product: ShopCatalogProduct): string | null {
  if (product.images?.length) {
    for (const img of product.images) {
      if (typeof img === "string" && img.trim()) return img.trim();
      if (img && typeof img === "object" && "image_url" in img) {
        const url = String((img as { image_url: string }).image_url).trim();
        if (url) return url;
      }
    }
  }
  const single = product.image_url || product.primary_image;
  return single && String(single).trim() ? String(single).trim() : null;
}

/**
 * Normalize selected filter ids to real (leaf) category ids.
 *
 * ``ProductCategory`` rows are flat leaves, so a selected id is just itself. The only
 * expansion needed is for a virtual ``CategoryGroup`` id (see ``shopFilterGroupParentId``),
 * which resolves to that group's member category ids.
 */
export function expandCategoryIdsForFilter(
  filterIds: number[],
  groups: ApiCategoryGroup[] = []
): Set<number> {
  const ids = new Set<number>();

  for (const id of filterIds) {
    if (!Number.isFinite(id) || id === 0) continue;
    if (id > 0) {
      ids.add(id);
      continue;
    }
    const group = groups.find((g) => shopFilterGroupParentId(g.id) === id);
    for (const memberId of group?.category_ids ?? []) {
      ids.add(memberId);
    }
  }

  return ids;
}

/** Names of categories matching ``filterIds`` (expanding any virtual group ids). */
export function categoryNamesForFilterIds(
  filterIds: number[],
  records: ShopCategoryRecord[],
  groups: ApiCategoryGroup[] = []
): Set<string> {
  if (!filterIds.length) return new Set();

  const expandedIds = expandCategoryIdsForFilter(filterIds, groups);
  const names = new Set<string>();

  for (const record of records) {
    if (expandedIds.has(record.id)) {
      names.add(record.name);
    }
  }

  return names;
}

/** True when category filters are set but resolve to no API category ids. */
export function shopCategoryFilterIsEmpty(
  filters: ShopListingFilters,
  categoryGroups: ApiCategoryGroup[] = []
): boolean {
  if (!filters.categories.length) return false;
  return expandCategoryIdsForFilter(filters.categories, categoryGroups).size === 0;
}

/** Build query string for GET /api/products/ from shop listing state. */
export function buildShopProductsQueryString({
  filters,
  sort,
  search,
  limit,
  offset,
  categoryGroups = [],
}: ShopProductsQuery): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("sort", sort);

  const q = search?.trim();
  if (q) {
    params.set("search", q);
  }

  const [priceMin, priceMax] = filters.price;
  if (priceMin > 0) {
    params.set("price_min", String(priceMin));
  }
  if (priceMax < SHOP_PRICE_MAX_UNLIMITED) {
    params.set("price_max", String(priceMax));
  }

  if (filters.categories.length > 0) {
    const expanded = expandCategoryIdsForFilter(filters.categories, categoryGroups);
    if (expanded.size > 0) {
      params.set("categories", [...expanded].join(","));
    }
  }

  return scopeProductsQueryString(params.toString());
}

/** Fetch one page of products from the API (server-side filter, sort, pagination). */
export async function fetchShopProductsPage(
  query: ShopProductsQuery,
  signal?: AbortSignal
): Promise<ShopProductsPage> {
  const qs = buildShopProductsQueryString(query);

  const res = await fetch(`/api/products/?${qs}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Failed to load products (${res.status})`);
  }

  const data = (await res.json()) as PaginatedProductsResponse;
  const results = data.results ?? [];
  const count = typeof data.count === "number" ? data.count : results.length;

  return {
    results,
    count,
    hasMore: query.offset + results.length < count,
  };
}

/** Warm the browser image cache for visible thumbnails (once per URL). */
const prefetchedImageUrls = new Set<string>();

export function prefetchShopProductImages(products: ShopCatalogProduct[]): void {
  if (typeof window === "undefined") return;

  for (const product of products) {
    const main = mainImageUrl(product);
    if (!main || prefetchedImageUrls.has(main)) continue;

    prefetchedImageUrls.add(main);
    const img = new window.Image();
    img.decoding = "async";
    img.src = main;
  }
}

export function prefetchCategoryImages(
  categories: Array<{ image_url?: string | null }>
): void {
  if (typeof window === "undefined") return;

  for (const category of categories) {
    const url = category.image_url?.trim();
    if (!url || prefetchedImageUrls.has(url)) continue;

    prefetchedImageUrls.add(url);
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
}
