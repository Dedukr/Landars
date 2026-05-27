import {
  HOME_SAUSAGES_GROUP,
  isHomeMergedCategoryId,
} from "@/constants/homeCategoryGroups";

export interface ApiCategory {
  id: number;
  name: string;
  parent: number | null;
  image_url?: string | null;
  products_count?: number | null;
  /** Units sold for the featured product (top seller in category). */
  top_seller_sold_quantity?: number | null;
}

export interface HomeDisplayCategory {
  id: number;
  name: string;
  parent: number | null;
  image_url?: string | null;
  products_count?: number | null;
  /** When set, links to shop with all of these category filters */
  combinedCategoryIds?: number[];
  isCombined?: boolean;
}

/**
 * Replace Lard, Meat Snacks, and Sausage (by id) with one combined carousel category.
 */
export function prepareHomeDisplayCategories(
  categories: ApiCategory[]
): HomeDisplayCategory[] {
  const mergedSources = categories.filter((c) =>
    isHomeMergedCategoryId(c.id)
  );

  const rest = categories.filter(
    (c) =>
      !isHomeMergedCategoryId(c.id) &&
      c.id !== HOME_SAUSAGES_GROUP.parentCategoryId
  );

  if (mergedSources.length === 0) {
    return [...rest]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ ...c }));
  }

  let productsCount: number | undefined;
  const counts = mergedSources
    .map((c) => c.products_count)
    .filter((n): n is number => typeof n === "number");
  if (counts.length > 0) {
    productsCount = counts.reduce((sum, n) => sum + n, 0);
  }

  const imageFromChild =
    mergedSources
      .filter((c) => c.image_url)
      .sort(
        (a, b) =>
          (b.top_seller_sold_quantity ?? 0) - (a.top_seller_sold_quantity ?? 0)
      )[0]?.image_url ?? null;

  const combined: HomeDisplayCategory = {
    id: -1,
    name: HOME_SAUSAGES_GROUP.displayName,
    parent: HOME_SAUSAGES_GROUP.parentCategoryId,
    image_url: imageFromChild ?? null,
    products_count: productsCount,
    combinedCategoryIds: [...HOME_SAUSAGES_GROUP.categoryIds],
    isCombined: true,
  };

  return [...rest, combined]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ ...c }));
}
