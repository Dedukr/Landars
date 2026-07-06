/** Featured shop/home categories: API name substring → display label (order matters). */
export const SHOP_FEATURED_CATEGORIES = [
  { matcher: "dumpling", label: "Dumplings" },
  { matcher: "lard", label: "Lard" },
  { matcher: "meat snack", label: "Meat Snacks" },
  { matcher: "soup", label: "Soups" },
  { matcher: "varenyky", label: "Varenyky" },
] as const;

export type ShopFeaturedCategoryConfig = (typeof SHOP_FEATURED_CATEGORIES)[number];

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function categoryMatchesShopChip(name: string): boolean {
  const normalized = normalizeCategoryName(name);
  return SHOP_FEATURED_CATEGORIES.some(({ matcher }) =>
    normalized.includes(matcher)
  );
}

export function shopCategoryChipSortIndex(name: string): number {
  const normalized = normalizeCategoryName(name);
  const index = SHOP_FEATURED_CATEGORIES.findIndex(({ matcher }) =>
    normalized.includes(matcher)
  );
  return index === -1 ? SHOP_FEATURED_CATEGORIES.length : index;
}

export interface ShopCategoryLike {
  id: number;
  name: string;
  image_url?: string | null;
  products_count?: number | null;
}

/** Resolve the five featured categories from an API list (stable labels + shop links). */
export function resolveShopFeaturedCategories<T extends ShopCategoryLike>(
  categories: T[]
): Array<T & { name: string }> {
  const resolved: Array<T & { name: string }> = [];

  for (const { matcher, label } of SHOP_FEATURED_CATEGORIES) {
    const match = categories.find((c) =>
      normalizeCategoryName(c.name).includes(matcher)
    );
    if (match) {
      resolved.push({ ...match, name: label });
    }
  }

  return resolved;
}

export function shopFeaturedCategoryFallbacks(): Array<{
  id: number;
  name: string;
}> {
  return SHOP_FEATURED_CATEGORIES.map((item, index) => ({
    id: -(index + 1),
    name: item.label,
  }));
}
