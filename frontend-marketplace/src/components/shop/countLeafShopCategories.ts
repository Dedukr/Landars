import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";

/**
 * Count categories that never appear as another row's `parent`.
 * Omit internal/parent tiers from headline stats ("X categories").
 */
export function countLeafShopCategories(categories: ShopCategoryRecord[]): number {
  const idHasChildren = new Set<number>();
  for (const c of categories) {
    if (c.parent != null) idHasChildren.add(c.parent);
  }
  return categories.filter((c) => !idHasChildren.has(c.id)).length;
}
