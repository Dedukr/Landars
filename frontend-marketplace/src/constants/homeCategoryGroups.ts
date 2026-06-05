/** Shop links for combined category / category-group tiles. */
export function buildCombinedCategoryShopHref(
  categoryIds: readonly number[],
  categoryGroupId?: number
): string {
  if (categoryGroupId != null && categoryGroupId > 0) {
    return `/shop/?category_group=${categoryGroupId}`;
  }
  if (categoryIds.length === 0) return "/shop/";
  return `/shop/?categories=${categoryIds.join(",")}`;
}
