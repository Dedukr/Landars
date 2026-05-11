/**
 * Sentinel max: omit `price_max` from API when unchanged so all products qualify.
 */
export const SHOP_PRICE_MAX_UNLIMITED = 50_000;

export interface ShopListingFilters {
  categories: number[];
  /** `[min, max]` in GBP; omit from API query when `[0, SHOP_PRICE_MAX_UNLIMITED]`. */
  price: [number, number];
  inStock: boolean;
}
