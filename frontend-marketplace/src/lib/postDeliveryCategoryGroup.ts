/**
 * Post-delivery rules use CategoryGroup #1 (configurable via API / Django settings).
 */

export interface PostDeliveryCategoryGroup {
  id: number;
  name: string;
  description: string | null;
  category_ids: number[];
  category_names: string[];
}

let cached: PostDeliveryCategoryGroup | null = null;
let fetchPromise: Promise<PostDeliveryCategoryGroup | null> | null = null;

export async function fetchPostDeliveryCategoryGroup(): Promise<PostDeliveryCategoryGroup | null> {
  if (cached) return cached;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/category-groups/post-delivery/")
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as PostDeliveryCategoryGroup;
      cached = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

export function postDeliveryCategoryNameSet(
  group: PostDeliveryCategoryGroup
): Set<string> {
  return new Set(
    (group.category_names ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
}

/** Product has at least one category from the post-delivery group (by name). */
export function productHasPostDeliveryCategory(
  categoryNames: string[] | undefined,
  nameSet: Set<string>
): boolean {
  const names = (categoryNames ?? [])
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().toLowerCase());
  return names.some((n) => nameSet.has(n));
}

/** Every cart line qualifies for post delivery (Royal Mail). */
export function allProductsHavePostDeliveryCategory(
  products: { categories: string[] }[],
  nameSet: Set<string>
): boolean {
  if (products.length === 0) return false;
  return products.every((p) =>
    productHasPostDeliveryCategory(p.categories, nameSet)
  );
}
