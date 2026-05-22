/** Substrings used to match API category names for shop search-bar shortcuts (display order). */
export const SHOP_CATEGORY_CHIP_MATCHERS = [
  "dumpling",
  "lard",
  "meat snack",
  "soup",
  "varenyky",
] as const;

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function categoryMatchesShopChip(name: string): boolean {
  const normalized = normalizeCategoryName(name);
  return SHOP_CATEGORY_CHIP_MATCHERS.some((matcher) =>
    normalized.includes(matcher)
  );
}

export function shopCategoryChipSortIndex(name: string): number {
  const normalized = normalizeCategoryName(name);
  const index = SHOP_CATEGORY_CHIP_MATCHERS.findIndex((matcher) =>
    normalized.includes(matcher)
  );
  return index === -1 ? SHOP_CATEGORY_CHIP_MATCHERS.length : index;
}
