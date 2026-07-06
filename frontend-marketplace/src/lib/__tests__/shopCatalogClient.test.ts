import {
  applyShopListingQuery,
  expandCategoryIdsForFilter,
  type ShopCatalogProduct,
} from "@/lib/shopCatalogClient";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
import type { ShopListingFilters } from "@/types/shop-filters";
import { SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";

const records: ShopCategoryRecord[] = [
  { id: 1, name: "Meat Snacks" },
  { id: 2, name: "Pork Fat" },
  { id: 3, name: "Bakery" },
];

const groups: ApiCategoryGroup[] = [
  {
    id: 5,
    name: "Delivery by post",
    category_ids: [1, 2],
    category_names: ["Meat Snacks", "Pork Fat"],
  },
];

const catalog: ShopCatalogProduct[] = [
  {
    id: 10,
    name: "Jerky",
    price: "5.00",
    categories: ["Meat Snacks"],
  },
  {
    id: 11,
    name: "Bread",
    price: "3.00",
    categories: ["Bakery"],
  },
];

const baseFilters: ShopListingFilters = {
  categories: [],
  price: [0, SHOP_PRICE_MAX_UNLIMITED],
  inStock: false,
};

describe("expandCategoryIdsForFilter", () => {
  it("returns each selected leaf id as-is (categories are flat, no expansion needed)", () => {
    expect(expandCategoryIdsForFilter([1, 2])).toEqual(new Set([1, 2]));
  });

  it("ignores invalid ids", () => {
    expect(expandCategoryIdsForFilter([0, NaN])).toEqual(new Set());
  });

  it("expands a virtual CategoryGroup id to its member category ids", () => {
    expect(expandCategoryIdsForFilter([-5], groups)).toEqual(new Set([1, 2]));
  });

  it("returns nothing for an unknown virtual group id", () => {
    expect(expandCategoryIdsForFilter([-999], groups)).toEqual(new Set());
  });
});

describe("applyShopListingQuery", () => {
  it("matches products tagged with a selected leaf category", () => {
    const result = applyShopListingQuery(
      catalog,
      { ...baseFilters, categories: [1] },
      "name_asc",
      undefined,
      records
    );

    expect(result.map((p) => p.id)).toEqual([10]);
  });

  it("matches products when filtering by a virtual CategoryGroup id", () => {
    const result = applyShopListingQuery(
      catalog,
      { ...baseFilters, categories: [-5] },
      "name_asc",
      undefined,
      records,
      groups
    );

    expect(result.map((p) => p.id)).toEqual([10]);
  });
});
