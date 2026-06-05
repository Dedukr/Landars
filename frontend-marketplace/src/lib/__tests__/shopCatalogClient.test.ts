import {
  applyShopListingQuery,
  expandCategoryIdsForFilter,
  type ShopCatalogProduct,
} from "@/lib/shopCatalogClient";
import type { ShopCategoryRecord } from "@/components/shop/ShopFilterPanelContent";
import type { ShopListingFilters } from "@/types/shop-filters";
import { SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";

const records: ShopCategoryRecord[] = [
  { id: 1, name: "Post delivery parent", parent: null },
  { id: 2, name: "Meat Snacks", parent: 1 },
  { id: 3, name: "Pork Fat", parent: 1 },
];

const catalog: ShopCatalogProduct[] = [
  {
    id: 10,
    name: "Jerky",
    price: "5.00",
    categories: ["Meat Snacks", "Post delivery parent"],
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
  it("includes all descendant category ids", () => {
    expect(expandCategoryIdsForFilter([1], records)).toEqual(new Set([1, 2, 3]));
  });

  it("ignores invalid ids", () => {
    expect(expandCategoryIdsForFilter([-10001, 0, NaN], records)).toEqual(
      new Set()
    );
  });
});

describe("applyShopListingQuery", () => {
  it("matches products in descendant categories when filtering by parent", () => {
    const result = applyShopListingQuery(
      catalog,
      { ...baseFilters, categories: [1] },
      "name_asc",
      undefined,
      records
    );

    expect(result.map((p) => p.id)).toEqual([10]);
  });

  it("matches products when filtering by post-delivery group member ids", () => {
    const result = applyShopListingQuery(
      catalog,
      { ...baseFilters, categories: [2, 3] },
      "name_asc",
      undefined,
      records
    );

    expect(result.map((p) => p.id)).toEqual([10]);
  });
});
