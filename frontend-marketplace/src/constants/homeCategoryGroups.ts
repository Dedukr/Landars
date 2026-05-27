/**
 * Home carousel: merge multiple API categories into one card (by id).
 * Update ids here if categories are re-seeded in Django admin.
 */
export const HOME_SAUSAGES_GROUP = {
  /** Shown on the combined category card */
  displayName: "Meat snacks, sausages, pork fat",
  /** Leaf categories merged into one carousel tile */
  categoryIds: [18, 19, 12] as const,
  /** Parent tier id — hidden from carousel when present (children are merged) */
  parentCategoryId: 16,
  /** Stable React key for the virtual tile */
  virtualKey: "home-sausages-group",
} as const;

export type HomeSausagesGroupId =
  (typeof HOME_SAUSAGES_GROUP.categoryIds)[number];

const mergedIdSet = new Set<number>(HOME_SAUSAGES_GROUP.categoryIds);

export function isHomeMergedCategoryId(id: number): boolean {
  return mergedIdSet.has(id);
}

export function buildCombinedCategoryShopHref(categoryIds: readonly number[]): string {
  if (categoryIds.length === 0) return "/shop/";
  return `/shop/?categories=${categoryIds.join(",")}`;
}
