import type {
  FestivalMenuAddition,
  FestivalMenuFilling,
  FestivalMenuProduct,
} from "@/lib/festivalMenuApi";

export type OptionCategory<T> = {
  label: string;
  options: T[];
};

export function categorySectionId(name: string): string {
  return `category-${name.toLowerCase().replace(/\s+/g, "-")}`;
}

export function productImageKey(
  productName: string,
  fillingName: string | null,
  imageUrl: string
): string {
  return fillingName
    ? `${productName}:${fillingName}:${imageUrl}`
    : `${productName}:${imageUrl}`;
}

/** PDF-style alternating image column — even index left, odd index right. */
export function entryImageSide(index: number): "left" | "right" {
  return index % 2 === 0 ? "left" : "right";
}

/** Fillings map to an option category under the menu item. */
export function fillingsOptionCategory(
  fillings: FestivalMenuFilling[]
): OptionCategory<FestivalMenuFilling> | null {
  if (fillings.length === 0) return null;
  return { label: "Fillings", options: fillings };
}

/** Group additions under their backend class name, with a safe fallback label. */
export function additionsOptionCategory(
  additions: FestivalMenuAddition[],
  additionClass: string | null = null
): OptionCategory<FestivalMenuAddition> | null {
  if (additions.length === 0) return null;
  return { label: additionClass?.trim() || "Add-ons", options: additions };
}

export type FestivalMenuCardItem = {
  key: string;
  product: FestivalMenuProduct;
  filling: FestivalMenuFilling | null;
};

export type FestivalCategoryLayout = {
  simpleProducts: FestivalMenuProduct[];
  fillingProducts: FestivalMenuProduct[];
};

/** Split products into simple items and products that expose filling variants. */
export function partitionCategoryProducts(
  products: FestivalMenuProduct[]
): FestivalCategoryLayout {
  const simpleProducts: FestivalMenuProduct[] = [];
  const fillingProducts: FestivalMenuProduct[] = [];

  for (const product of products) {
    if (product.fillings.length === 0) {
      simpleProducts.push(product);
    } else {
      fillingProducts.push(product);
    }
  }

  return { simpleProducts, fillingProducts };
}

/** @deprecated Use partitionCategoryProducts — kept for tests that need flat expansion. */
export function expandCategoryProducts(
  products: FestivalMenuProduct[]
): FestivalMenuCardItem[] {
  const items: FestivalMenuCardItem[] = [];

  for (const product of products) {
    if (product.fillings.length === 0) {
      items.push({ key: product.name, product, filling: null });
      continue;
    }
    for (const filling of product.fillings) {
      items.push({
        key: `${product.name}:${filling.name}`,
        product,
        filling,
      });
    }
  }

  return items;
}

/**
 * Aggregate unique addition classes and options across all products in a menu
 * category so add-ons appear once per category, not under each product.
 */
export function collectCategoryAdditionGroups(
  products: FestivalMenuProduct[]
): OptionCategory<FestivalMenuAddition>[] {
  const byClass = new Map<string, Map<string, FestivalMenuAddition>>();

  for (const product of products) {
    if (product.additions.length === 0) continue;
    const className = product.addition_class?.trim() || "Add-ons";
    let additionsByName = byClass.get(className);
    if (!additionsByName) {
      additionsByName = new Map();
      byClass.set(className, additionsByName);
    }
    for (const addition of product.additions) {
      if (!additionsByName.has(addition.name)) {
        additionsByName.set(addition.name, addition);
      }
    }
  }

  return Array.from(byClass.entries()).map(([label, additionsByName]) => ({
    label,
    options: Array.from(additionsByName.values()),
  }));
}

/** Short label for category add-ons band — no per-item listing. */
export function formatCategoryAdditionSummary(classLabel: string): string {
  const normalized = classLabel.trim();
  if (/drink/i.test(normalized)) {
    return "Drinks included";
  }
  return `${normalized} included`;
}

/** PDF-style choice heading for filling variants. */
export function fillingChoiceLabel(
  productName: string,
  fillings: FestivalMenuFilling[]
): string {
  if (/jerky/i.test(productName)) {
    return "Choose your variety";
  }
  if (/shashlik/i.test(productName)) {
    return "Choose your meat";
  }
  if (/water|soft drink|drink/i.test(productName) && fillings.length > 0) {
    return "Choose";
  }
  if (fillings.length > 1 && fillings.every((f) => /^(savoury|sweet)$/i.test(f.name))) {
    return "Choose your filling";
  }
  return "Choose your filling";
}

const SWEET_FILLING_RE =
  /apple|cinnamon|sweet|chocolate|berry|jam|honey|nutella|banana|cherry|strawberry|cottage\s*cheese/i;
const SAVOURY_FILLING_RE =
  /chicken|pork|beef|meat|mushroom|spinach|cheese\s*&\s*greens|ham|salmon|savoury/i;

export function isSweetCrepeFilling(name: string): boolean {
  if (SAVOURY_FILLING_RE.test(name) && !/cottage\s*cheese/i.test(name)) {
    return false;
  }
  return SWEET_FILLING_RE.test(name);
}

/** Split Filled Crepes (and similar) into quiet SAVOURY / SWEET groups when both exist. */
export function groupCrepeFillings(
  product: FestivalMenuProduct
): { savoury: FestivalMenuFilling[]; sweet: FestivalMenuFilling[] } | null {
  if (!/crepe/i.test(product.name) || product.fillings.length < 2) {
    return null;
  }
  const savoury: FestivalMenuFilling[] = [];
  const sweet: FestivalMenuFilling[] = [];
  for (const filling of product.fillings) {
    if (isSweetCrepeFilling(filling.name)) {
      sweet.push(filling);
    } else {
      savoury.push(filling);
    }
  }
  if (savoury.length === 0 || sweet.length === 0) {
    return null;
  }
  return { savoury, sweet };
}

export function isDrinkAdditionClass(classLabel: string): boolean {
  return /drink/i.test(classLabel.trim());
}

export function isMealsCategory(categoryName: string): boolean {
  return /^meals$/i.test(categoryName.trim());
}

/** True when any product in the menu exposes drink-related add-ons. */
export function menuHasDrinkAdditions(
  products: FestivalMenuProduct[]
): boolean {
  return collectCategoryAdditionGroups(products).some((group) =>
    isDrinkAdditionClass(group.label)
  );
}

/** Add-on groups excluding drink classes (shown on Meals row instead). */
export function nonDrinkAdditionGroups(
  groups: OptionCategory<FestivalMenuAddition>[]
): OptionCategory<FestivalMenuAddition>[] {
  return groups.filter((group) => !isDrinkAdditionClass(group.label));
}
