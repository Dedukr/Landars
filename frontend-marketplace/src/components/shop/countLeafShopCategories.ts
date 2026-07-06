import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";

/**
 * Number of real (leaf) shop categories. ``ProductCategory`` rows are flat leaves now —
 * there's no parent tier to exclude, so this is just the raw category count.
 */
export function countLeafShopCategories(categories: ShopCategoryRecord[]): number {
  return categories.length;
}
