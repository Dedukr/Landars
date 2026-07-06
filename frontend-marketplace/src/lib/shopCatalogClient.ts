import { scopeProductsQueryString } from "@/utils/catalogScope";
import type { ShopListingFilters } from "@/types/shop-filters";
import { SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import type { ShopProductDto } from "@/components/shop/ShopProductCard";
import {
  shopFilterGroupParentId,
  type ApiCategoryGroup,
} from "@/lib/prepareHomeDisplayCategories";

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

const PAGE_SIZE = 50;

export type ShopCatalogProduct = ShopProductDto & {
  sold_quantity?: number;
  sold_orders_count?: number;
};

interface PaginatedProductsResponse {
  results: ShopCatalogProduct[];
  count: number;
  next: string | null;
}

/** Load the full active catalogue once (paginated API walk). */
export async function fetchAllShopProducts(
  signal?: AbortSignal
): Promise<ShopCatalogProduct[]> {
  const all: ShopCatalogProduct[] = [];
  let offset = 0;

  while (true) {
    const qs = scopeProductsQueryString(
      new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort: "name_asc",
      }).toString()
    );

    const res = await fetch(`/api/products/?${qs}`, {
      headers: { Accept: "application/json" },
      signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to load products (${res.status})`);
    }

    const data = (await res.json()) as PaginatedProductsResponse;
    all.push(...(data.results ?? []));

    if (!data.next) break;
    offset += PAGE_SIZE;
  }

  return all;
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

function productPrice(product: ShopCatalogProduct): number {
  const n = parseFloat(String(product.price ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function productMatchesSearch(product: ShopCatalogProduct, search: string): boolean {
  const terms = search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  if (!terms.length) return true;

  const name = (product.name ?? "").toLowerCase();
  return terms.every((term) => name.includes(term));
}

function sortProducts(
  products: ShopCatalogProduct[],
  sort: string
): ShopCatalogProduct[] {
  const sorted = [...products];

  switch (sort) {
    case "name_desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "price_asc":
      sorted.sort((a, b) => productPrice(a) - productPrice(b));
      break;
    case "price_desc":
      sorted.sort((a, b) => productPrice(b) - productPrice(a));
      break;
    case "sales_desc":
      sorted.sort((a, b) => {
        const soldA = a.sold_quantity ?? 0;
        const soldB = b.sold_quantity ?? 0;
        if (soldB !== soldA) return soldB - soldA;
        const ordersA = a.sold_orders_count ?? 0;
        const ordersB = b.sold_orders_count ?? 0;
        if (ordersB !== ordersA) return ordersB - ordersA;
        return a.id - b.id;
      });
      break;
    case "category_asc":
      sorted.sort((a, b) => {
        const catA = (a.categories?.[0] ?? "").toLowerCase();
        const catB = (b.categories?.[0] ?? "").toLowerCase();
        if (catA !== catB) return catA.localeCompare(catB);
        return a.name.localeCompare(b.name);
      });
      break;
    case "name_asc":
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  return sorted;
}

/** Client-side listing query — no extra API calls after the catalogue is loaded. */
export function applyShopListingQuery(
  catalog: ShopCatalogProduct[],
  filters: ShopListingFilters,
  sort: string,
  search: string | undefined,
  categoryRecords: ShopCategoryRecord[],
  categoryGroups: ApiCategoryGroup[] = []
): ShopCatalogProduct[] {
  let result = catalog;

  if (filters.categories.length > 0) {
    if (categoryRecords.length === 0) {
      return [];
    }

    const allowedNames = categoryNamesForFilterIds(
      filters.categories,
      categoryRecords,
      categoryGroups
    );
    if (allowedNames.size === 0) {
      return [];
    }

    result = result.filter((product) =>
      (product.categories ?? []).some((name) => allowedNames.has(name))
    );
  }

  const q = search?.trim() ?? "";
  if (q) {
    result = result.filter((p) => productMatchesSearch(p, q));
  }

  const [priceMin, priceMax] = filters.price;
  if (priceMin > 0) {
    result = result.filter((p) => productPrice(p) >= priceMin);
  }
  if (priceMax < SHOP_PRICE_MAX_UNLIMITED) {
    result = result.filter((p) => productPrice(p) <= priceMax);
  }

  if (filters.inStock) {
    result = result.filter(
      (p) => typeof p.stock_quantity !== "number" || p.stock_quantity > 0
    );
  }

  return sortProducts(result, sort);
}

/** Warm the browser image cache for catalogue thumbnails (once per URL). */
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
