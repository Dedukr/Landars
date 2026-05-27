import type { HomeDisplayCategory } from "@/lib/prepareHomeDisplayCategories";

/** Category ids applied when a carousel tile is selected. */
export function getCategoryFilterIds(category: HomeDisplayCategory): number[] {
  if (category.combinedCategoryIds?.length) {
    return [...category.combinedCategoryIds];
  }
  if (category.id > 0) return [category.id];
  return [];
}

function sortedKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

export function isCategoryFilterActive(
  category: HomeDisplayCategory,
  activeIds: number[]
): boolean {
  const target = sortedKey(getCategoryFilterIds(category));
  const current = sortedKey(activeIds);
  return target.length > 0 && target === current;
}

export function getColumnsForWidth(width: number): number {
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

export function chunkCategories<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}
