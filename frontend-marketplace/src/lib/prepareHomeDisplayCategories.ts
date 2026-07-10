import { buildCombinedCategoryShopHref } from "@/constants/homeCategoryGroups";

export interface ApiCategory {
  id: number;
  name: string;
  image_url?: string | null;
  products_count?: number | null;
  /** Units sold for the featured product (top seller in category). */
  top_seller_sold_quantity?: number | null;
}

export interface HomeDisplayCategory {
  id: number;
  name: string;
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
  image_url?: string | null;
  category_ids: number[];
  category_names?: string[];
  products_count?: number;
}

const sortByNameDesc = (a: { name: string }, b: { name: string }) =>
  b.name.localeCompare(a.name, undefined, { sensitivity: "base" });

/** Display-only id for a CategoryGroup tile/virtual parent row in the shop UI. */
export function shopFilterGroupParentId(groupId: number): number {
  return -groupId;
}

/**
 * Shop-by-category shelf: every leaf ``ProductCategory`` not claimed by a
 * ``CategoryGroup``, plus one tile per non-empty ``CategoryGroup``. Categories are flat
 * leaves now, so there's no tree to walk — grouping is purely CategoryGroup membership.
 */
export function buildShopByCategoryDisplay(
  categories: ApiCategory[],
  groups: ApiCategoryGroup[]
): HomeDisplayCategory[] {
  const groupedCategoryIds = new Set(groups.flatMap((g) => g.category_ids ?? []));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const leafTiles: HomeDisplayCategory[] = categories
    .filter((c) => !groupedCategoryIds.has(c.id))
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
        id: shopFilterGroupParentId(g.id),
        name: g.name,
        image_url: g.image_url || imageFromMember,
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
 * Shop sidebar filter: each ``CategoryGroup`` becomes a virtual parent row with its full
 * member list nested directly under it (one level only — categories have no children of
 * their own); every category not claimed by ANY group is a standalone root row with no
 * children. A category belonging to multiple groups is intentionally shown under every
 * one of those groups (e.g. a category can legitimately be part of both a merchandising
 * group like "Sausages and Barbecue" and a shipping group like "Delivery by post") — it
 * is only excluded from the root/ungrouped list.
 */
export function buildShopFilterPanelCategories<
  T extends { id: number; name: string },
>(categories: T[], groups: ApiCategoryGroup[]): Array<T & { parent: number | null }> {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const groupedIds = new Set<number>();
  const result: Array<T & { parent: number | null }> = [];

  for (const group of groups) {
    const memberIds = (group.category_ids ?? []).filter((id) => categoryById.has(id));
    if (memberIds.length === 0) continue;

    const virtualParentId = shopFilterGroupParentId(group.id);
    result.push({
      id: virtualParentId,
      name: group.name,
      parent: null,
    } as T & { parent: number | null });

    for (const id of memberIds) {
      groupedIds.add(id);
      result.push({ ...(categoryById.get(id) as T), parent: virtualParentId });
    }
  }

  for (const cat of categories) {
    if (groupedIds.has(cat.id)) continue;
    result.push({ ...cat, parent: null });
  }

  return result;
}

export { buildCombinedCategoryShopHref };
