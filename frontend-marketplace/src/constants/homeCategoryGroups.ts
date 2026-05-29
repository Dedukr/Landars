/**
 * Home carousel: merged post-delivery group tile.
 * Category ids/names are loaded from ``/api/category-groups/post-delivery/`` at runtime.
 */

export const POST_DELIVERY_GROUP_VIRTUAL_KEY = "home-post-delivery-group";

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

export function isPostDeliveryMergedCategoryId(
  id: number,
  categoryIds: readonly number[]
): boolean {
  return categoryIds.includes(id);
}
