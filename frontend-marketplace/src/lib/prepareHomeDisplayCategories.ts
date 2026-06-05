import { buildCombinedCategoryShopHref } from "@/constants/homeCategoryGroups";

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

/** Display-only parent id for a category group in the shop filter sidebar. */
export function shopFilterGroupParentId(groupId: number): number {
  return -groupId;
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

/** Category ids that are parents (in the API tree) of a grouped category. */
function ancestorIdsOfGrouped<
  T extends { id: number; parent?: number | null },
>(groupedIds: Set<number>, categoryById: Map<number, T>): Set<number> {
  const ancestors = new Set<number>();

  for (const groupedId of groupedIds) {
    let current = categoryById.get(groupedId);
    while (current?.parent != null) {
      ancestors.add(current.parent);
      current = categoryById.get(current.parent);
    }
  }

  return ancestors;
}

/** True when ``catId`` has a descendant not assigned to any category group. */
function hasUngroupedDescendantInTree<
  T extends { id: number; parent?: number | null },
>(
  catId: number,
  groupedIds: Set<number>,
  assignedToGroup: Set<number>,
  categories: T[]
): boolean {
  for (const child of categories) {
    if (child.parent !== catId) continue;
    if (!groupedIds.has(child.id) && !assignedToGroup.has(child.id)) {
      return true;
    }
    if (
      hasUngroupedDescendantInTree(
        child.id,
        groupedIds,
        assignedToGroup,
        categories
      )
    ) {
      return true;
    }
  }
  return false;
}

function resolveFilterParent<
  T extends { id: number; parent?: number | null },
>(
  cat: T,
  groupedIds: Set<number>,
  groupedAncestorIds: Set<number>,
  assignedToGroup: Set<number>,
  categories: T[],
  categoryById: Map<number, T>
): number | null {
  let parent = cat.parent ?? null;

  while (parent != null) {
    if (groupedIds.has(parent) || assignedToGroup.has(parent)) {
      const parentCat = categoryById.get(parent);
      parent = parentCat?.parent ?? null;
      continue;
    }
    if (
      groupedAncestorIds.has(parent) &&
      !hasUngroupedDescendantInTree(
        parent,
        groupedIds,
        assignedToGroup,
        categories
      )
    ) {
      const parentCat = categoryById.get(parent);
      parent = parentCat?.parent ?? null;
      continue;
    }
    break;
  }

  return parent;
}

/** Drop grouped members superseded by the virtual group parent or a deeper member. */
function filterGroupMembersForDisplay<
  T extends { id: number; name: string; parent?: number | null },
>(
  members: T[],
  memberIds: number[],
  groupName: string,
  categoryById: Map<number, T>
): T[] {
  const memberIdSet = new Set(memberIds);
  const groupNameNorm = normalizeCategoryName(groupName);

  return members.filter((cat) => {
    if (normalizeCategoryName(cat.name) === groupNameNorm) {
      return false;
    }

    const hasGroupedDescendant = memberIds.some((otherId) => {
      if (otherId === cat.id) return false;
      let current = categoryById.get(otherId);
      while (current?.parent != null) {
        if (current.parent === cat.id) return true;
        if (!memberIdSet.has(current.parent)) break;
        current = categoryById.get(current.parent);
      }
      return false;
    });

    return !hasGroupedDescendant;
  });
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
 * Shop sidebar filter: each CategoryGroup is a virtual parent with its member
 * categories as children; remaining categories keep their natural tree.
 */
export function buildShopFilterPanelCategories<
  T extends { id: number; name: string; parent?: number | null },
>(categories: T[], groups: ApiCategoryGroup[]): T[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const groupedIds = new Set(groups.flatMap((g) => g.category_ids ?? []));
  const groupedAncestorIds = ancestorIdsOfGrouped(groupedIds, categoryById);
  const assignedToGroup = new Set<number>();
  const result: T[] = [];

  for (const group of groups) {
    const memberIds = group.category_ids ?? [];
    if (memberIds.length === 0) continue;

    const members = memberIds
      .map((id) => categoryById.get(id))
      .filter((c): c is T => Boolean(c));
    if (members.length === 0) continue;

    const displayMembers = filterGroupMembersForDisplay(
      members,
      memberIds,
      group.name,
      categoryById
    );
    if (displayMembers.length === 0) continue;

    const virtualParentId = shopFilterGroupParentId(group.id);
    result.push({
      id: virtualParentId,
      name: group.name,
      parent: null,
    } as T);

    for (const member of displayMembers) {
      if (assignedToGroup.has(member.id)) continue;
      assignedToGroup.add(member.id);
      result.push({
        ...member,
        parent: virtualParentId,
      });
    }
  }

  for (const cat of categories) {
    if (groupedIds.has(cat.id) || assignedToGroup.has(cat.id)) continue;

    if (
      groupedAncestorIds.has(cat.id) &&
      !hasUngroupedDescendantInTree(
        cat.id,
        groupedIds,
        assignedToGroup,
        categories
      )
    ) {
      continue;
    }

    result.push({
      ...cat,
      parent: resolveFilterParent(
        cat,
        groupedIds,
        groupedAncestorIds,
        assignedToGroup,
        categories,
        categoryById
      ),
    });
  }

  const visibleIds = new Set(result.map((c) => c.id));
  return result.filter((cat) => {
    if (cat.parent != null) return true;
    const hasChild = result.some((c) => c.parent === cat.id);
    if (!hasChild) return true;
    return result.some((c) => c.parent === cat.id && visibleIds.has(c.id));
  });
}

export { buildCombinedCategoryShopHref };
