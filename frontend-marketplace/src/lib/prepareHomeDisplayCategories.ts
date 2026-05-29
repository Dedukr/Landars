import {
  buildCombinedCategoryShopHref,
  isPostDeliveryMergedCategoryId,
  POST_DELIVERY_GROUP_VIRTUAL_KEY,
} from "@/constants/homeCategoryGroups";
import type { PostDeliveryCategoryGroup } from "@/lib/postDeliveryCategoryGroup";

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
  /** Tile represents a CategoryGroup (not a single ProductCategory). */
  isCategoryGroup?: boolean;
  /** Set when ``isCategoryGroup`` — used for ``?category_group=`` shop links. */
  categoryGroupId?: number;
}

export interface ApiCategoryGroup {
  id: number;
  name: string;
  description?: string | null;
  category_ids: number[];
  category_names?: string[];
  products_count?: number;
}

const sortByNameDesc = (a: { name: string }, b: { name: string }) =>
  b.name.localeCompare(a.name, undefined, { sensitivity: "base" });

/** Virtual parent id for post-delivery subcategories in the shop filter tree only. */
export const SHOP_POST_DELIVERY_FILTER_PARENT_ID = -10001;

/** Shown under post delivery in the shop filter (still hidden from carousel leaves). */
const SHOP_FILTER_POST_DELIVERY_SUBCATEGORY_NAMES = new Set(
  ["Meat Snacks", "Pork Fat", "Ready for Grill"].map((n) => n.trim().toLowerCase())
);

/** Hidden from shop sidebar filter — covered by a CategoryGroup carousel tile. */
const SHOP_FILTER_EXCLUDED_CATEGORY_NAMES = new Set(
  [
    "Sausages and Barbecue",
    "Sausages and Marinated products",
    "Lard",
  ].map((n) => n.trim().toLowerCase())
);

function isShopFilterPanelExcludedCategory(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return SHOP_FILTER_EXCLUDED_CATEGORY_NAMES.has(normalized);
}

/**
 * Shop-by-category shelf: leaf categories (have a parent) plus category group tiles.
 * Categories assigned to a group are omitted from the leaf list (shown via the group).
 */
export function buildShopByCategoryDisplay(
  categories: ApiCategory[],
  groups: ApiCategoryGroup[]
): HomeDisplayCategory[] {
  const groupedCategoryIds = new Set(
    groups.flatMap((g) => g.category_ids ?? [])
  );

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const leafTiles: HomeDisplayCategory[] = categories
    .filter((c) => c.parent !== null && !groupedCategoryIds.has(c.id))
    .map((c) => ({ ...c }));

  const groupTiles: HomeDisplayCategory[] = groups
    .filter((g) => (g.category_ids?.length ?? 0) > 0)
    .map((g) => {
      const members = (g.category_ids ?? [])
        .map((id) => categoryById.get(id))
        .filter((c): c is ApiCategory => Boolean(c));

      const imageFromMember =
        members
          .filter((c) => c.image_url)
          .sort(
            (a, b) =>
              (b.top_seller_sold_quantity ?? 0) -
              (a.top_seller_sold_quantity ?? 0)
          )[0]?.image_url ?? null;

      let productsCount = g.products_count;
      if (productsCount == null && members.length > 0) {
        const counts = members
          .map((c) => c.products_count)
          .filter((n): n is number => typeof n === "number");
        if (counts.length > 0) {
          productsCount = counts.reduce((sum, n) => sum + n, 0);
        }
      }

      return {
        id: -g.id,
        name: g.name,
        parent: null,
        image_url: imageFromMember,
        products_count: productsCount ?? null,
        combinedCategoryIds: [...(g.category_ids ?? [])],
        isCombined: true,
        isCategoryGroup: true,
        categoryGroupId: g.id,
      };
    });

  return [...leafTiles, ...groupTiles].sort(sortByNameDesc);
}

/**
 * Categories for the shop sidebar filter: omit members of any CategoryGroup
 * (they are filtered via the group carousel tile) and parents with no visible children.
 */
export function filterCategoriesForShopPanel<
  T extends { id: number; name: string; parent?: number | null },
>(categories: T[], groups: ApiCategoryGroup[]): T[] {
  const groupedIds = new Set(groups.flatMap((g) => g.category_ids ?? []));
  const withoutGrouped = categories.filter(
    (c) => !groupedIds.has(c.id) && !isShopFilterPanelExcludedCategory(c.name)
  );
  const visibleIds = new Set(withoutGrouped.map((c) => c.id));

  return withoutGrouped.filter((cat) => {
    if (cat.parent != null) return true;
    const childIds = categories
      .filter((c) => c.parent === cat.id)
      .map((c) => c.id);
    if (childIds.length === 0) return true;
    return childIds.some((id) => visibleIds.has(id));
  });
}

/**
 * Shop sidebar filter: nest Meat Snacks / Pork Fat / Ready for Grill under the
 * post-delivery group name. Display-only hierarchy — does not change API parents.
 */
export function buildShopFilterPanelCategories<
  T extends { id: number; name: string; parent?: number | null },
>(
  categories: T[],
  groups: ApiCategoryGroup[],
  postDeliveryGroup: PostDeliveryCategoryGroup | null
): T[] {
  const base = filterCategoriesForShopPanel(categories, groups);

  if (!postDeliveryGroup) {
    return base;
  }

  const subcats = categories.filter((c) =>
    SHOP_FILTER_POST_DELIVERY_SUBCATEGORY_NAMES.has(c.name.trim().toLowerCase())
  );
  if (subcats.length === 0) {
    return base;
  }

  const subIds = new Set(subcats.map((c) => c.id));
  const withoutSubs = base.filter((c) => !subIds.has(c.id));

  const virtualParent = {
    id: SHOP_POST_DELIVERY_FILTER_PARENT_ID,
    name: postDeliveryGroup.name,
    parent: null,
  } as T;

  const reparentedSubs = subcats.map((c) => ({
    ...c,
    parent: SHOP_POST_DELIVERY_FILTER_PARENT_ID,
  }));

  return [...withoutSubs, virtualParent, ...reparentedSubs];
}

/**
 * Merge categories from the post-delivery CategoryGroup into one carousel tile.
 */
export function prepareHomeDisplayCategories(
  categories: ApiCategory[],
  postDeliveryGroup?: PostDeliveryCategoryGroup | null
): HomeDisplayCategory[] {
  const mergeIds = postDeliveryGroup?.category_ids ?? [];
  if (mergeIds.length === 0) {
    return [...categories].sort(sortByNameDesc).map((c) => ({ ...c }));
  }

  const mergeIdSet = new Set(mergeIds);
  const mergedSources = categories.filter((c) => mergeIdSet.has(c.id));

  const rest = categories.filter((c) => !mergeIdSet.has(c.id));

  if (mergedSources.length === 0) {
    return [...rest].sort(sortByNameDesc).map((c) => ({ ...c }));
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
    name: postDeliveryGroup?.name ?? "Post delivery",
    parent: null,
    image_url: imageFromChild ?? null,
    products_count: productsCount,
    combinedCategoryIds: [...mergeIds],
    isCombined: true,
  };

  return [...rest, combined].sort(sortByNameDesc).map((c) => ({ ...c }));
}

export { buildCombinedCategoryShopHref, isPostDeliveryMergedCategoryId, POST_DELIVERY_GROUP_VIRTUAL_KEY };
