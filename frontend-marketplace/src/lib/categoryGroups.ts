import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
import { fetchCategoryGroups } from "@/lib/fetchCategoryGroups";

/** Matches backend ``POST_DELIVERY_CATEGORY_GROUP_ID`` (default 1). */
export const POST_DELIVERY_CATEGORY_GROUP_ID = 1;

export function findPostDeliveryCategoryGroup(
  groups: ApiCategoryGroup[]
): ApiCategoryGroup | null {
  return (
    groups.find((g) => g.id === POST_DELIVERY_CATEGORY_GROUP_ID) ?? null
  );
}

export async function getPostDeliveryCategoryGroup(): Promise<ApiCategoryGroup | null> {
  const groups = await fetchCategoryGroups();
  return findPostDeliveryCategoryGroup(groups);
}

export function categoryGroupNameSet(group: ApiCategoryGroup): Set<string> {
  return new Set(
    (group.category_names ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
}

/** Product has at least one category from the group (by name). */
export function productMatchesCategoryGroup(
  categoryNames: string[] | undefined,
  nameSet: Set<string>
): boolean {
  const names = (categoryNames ?? [])
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().toLowerCase());
  return names.some((n) => nameSet.has(n));
}

/** Every cart line qualifies for the category group (e.g. post delivery). */
export function allProductsMatchCategoryGroup(
  products: { categories: string[] }[],
  nameSet: Set<string>
): boolean {
  if (products.length === 0) return false;
  return products.every((p) => productMatchesCategoryGroup(p.categories, nameSet));
}
