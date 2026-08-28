import {
  buildShopProductsQueryString,
  expandCategoryIdsForFilter,
  shopCategoryFilterIsEmpty,
} from "@/lib/shopCatalogClient";
import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
import type { ShopListingFilters } from "@/types/shop-filters";
import { SHOP_PRICE_MAX_UNLIMITED } from "@/types/shop-filters";

const groups: ApiCategoryGroup[] = [
  {
    id: 5,
    name: "Delivery by post",
    category_ids: [1, 2],
    category_names: ["Meat Snacks", "Pork Fat"],
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

describe("shopCategoryFilterIsEmpty", () => {
  it("is false when no category filter is applied", () => {
    expect(shopCategoryFilterIsEmpty(baseFilters, groups)).toBe(false);
  });

  it("is false when category ids resolve", () => {
    expect(
      shopCategoryFilterIsEmpty({ ...baseFilters, categories: [1] }, groups)
    ).toBe(false);
  });

  it("is true when virtual group id does not resolve", () => {
    expect(
      shopCategoryFilterIsEmpty({ ...baseFilters, categories: [-999] }, groups)
    ).toBe(true);
  });
});

describe("buildShopProductsQueryString", () => {
  it("includes pagination, sort, and expanded category ids", () => {
    const qs = buildShopProductsQueryString({
      filters: { ...baseFilters, categories: [-5] },
      sort: "category_asc",
      search: "jerky",
      limit: 50,
      offset: 0,
      categoryGroups: groups,
    });

    const params = new URLSearchParams(qs);
    expect(params.get("limit")).toBe("50");
    expect(params.get("offset")).toBe("0");
    expect(params.get("sort")).toBe("category_asc");
    expect(params.get("search")).toBe("jerky");
    expect(params.get("categories")).toBe("1,2");
  });

  it("omits price bounds at defaults", () => {
    const qs = buildShopProductsQueryString({
      filters: baseFilters,
      sort: "name_asc",
      limit: 24,
      offset: 50,
    });

    const params = new URLSearchParams(qs);
    expect(params.get("price_min")).toBeNull();
    expect(params.get("price_max")).toBeNull();
    expect(params.get("categories")).toBeNull();
  });

  it("includes custom price range", () => {
    const qs = buildShopProductsQueryString({
      filters: { ...baseFilters, price: [5, 20] },
      sort: "price_asc",
      limit: 50,
      offset: 0,
    });

    const params = new URLSearchParams(qs);
    expect(params.get("price_min")).toBe("5");
    expect(params.get("price_max")).toBe("20");
  });
});
