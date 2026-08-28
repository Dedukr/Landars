/** Cached product rows for cart / wishlist pages (stale-while-revalidate). */
export interface CachedListingProduct {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
  description?: string;
  categories?: string[];
  sold_quantity?: number;
  sold_orders_count?: number;
  original_price?: string;
  discount_percentage?: number;
  in_stock?: boolean;
  stock_quantity?: number;
}

export type ListingProductCacheScope = "cart" | "wishlist";

function cacheKey(scope: ListingProductCacheScope, userId: number): string {
  return `${scope}_products_v1_${userId}`;
}

export function readListingProductsCache(
  scope: ListingProductCacheScope,
  userId: number
): CachedListingProduct[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(scope, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (row): row is CachedListingProduct =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as CachedListingProduct).id === "number" &&
        typeof (row as CachedListingProduct).name === "string"
    );
  } catch {
    return null;
  }
}

export function writeListingProductsCache(
  scope: ListingProductCacheScope,
  userId: number,
  products: CachedListingProduct[]
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(scope, userId), JSON.stringify(products));
  } catch {
    // Quota exceeded or private mode — ignore
  }
}

export function clearListingProductsCache(
  scope: ListingProductCacheScope,
  userId: number
): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cacheKey(scope, userId));
}
