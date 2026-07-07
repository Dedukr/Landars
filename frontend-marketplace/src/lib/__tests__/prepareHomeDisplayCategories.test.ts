import {
  buildShopByCategoryDisplay,
  buildShopCarouselCategories,
  buildShopFilterPanelCategories,
  shopFilterGroupParentId,
  type ApiCategory,
  type ApiCategoryGroup,
} from "@/lib/prepareHomeDisplayCategories";

describe("buildShopCarouselCategories", () => {
  const categories: ApiCategory[] = [
    { id: 1, name: "Meat Snacks", products_count: 5 },
    { id: 2, name: "Pork Fat", products_count: 2 },
    { id: 3, name: "Bakery", products_count: 10 },
  ];

  it("shows every category as its own tile (no group aggregation)", () => {
    const display = buildShopCarouselCategories(categories);
    expect(display).toHaveLength(3);
    expect(display.some((c) => c.isCategoryGroup)).toBe(false);
    expect(display.map((c) => c.id).sort()).toEqual([1, 2, 3]);
  });

  it("sorts categories by name descending", () => {
    const display = buildShopCarouselCategories(categories);
    expect(display.map((c) => c.name)).toEqual([
      "Pork Fat",
      "Meat Snacks",
      "Bakery",
    ]);
  });

  it("includes group tiles alongside every category tile", () => {
    const groups: ApiCategoryGroup[] = [
      {
        id: 1,
        name: "Delivery by post",
        category_ids: [1, 2],
        products_count: 7,
      },
    ];
    const display = buildShopCarouselCategories(categories, groups);

    expect(display.some((c) => c.isCategoryGroup && c.name === "Delivery by post")).toBe(
      true
    );
    expect(display.filter((c) => !c.isCategoryGroup)).toHaveLength(3);
    expect(display.some((c) => c.id === 1)).toBe(true);
    expect(display.some((c) => c.id === 2)).toBe(true);
  });
});

describe("buildShopByCategoryDisplay", () => {
  const categories: ApiCategory[] = [
    { id: 1, name: "Meat Snacks", products_count: 5 },
    { id: 2, name: "Pork Fat", products_count: 2 },
    { id: 3, name: "Bakery", products_count: 10 },
  ];

  const groups: ApiCategoryGroup[] = [
    {
      id: 1,
      name: "Delivery by post",
      category_ids: [1, 2],
      category_names: ["Meat Snacks", "Pork Fat"],
      products_count: 7,
    },
  ];

  it("shows one tile per non-empty CategoryGroup and omits its member categories", () => {
    const display = buildShopByCategoryDisplay(categories, groups);

    const groupTile = display.find((c) => c.isCategoryGroup);
    expect(groupTile).toMatchObject({
      id: shopFilterGroupParentId(1),
      name: "Delivery by post",
      isCombined: true,
      categoryGroupId: 1,
      combinedCategoryIds: [1, 2],
      products_count: 7,
    });

    expect(display.some((c) => c.id === 1)).toBe(false);
    expect(display.some((c) => c.id === 2)).toBe(false);
  });

  it("keeps ungrouped categories as their own tiles", () => {
    const display = buildShopByCategoryDisplay(categories, groups);
    expect(display.find((c) => c.id === 3)).toMatchObject({ name: "Bakery" });
  });

  it("omits empty CategoryGroups", () => {
    const display = buildShopByCategoryDisplay(categories, [
      { id: 2, name: "Empty group", category_ids: [] },
    ]);
    expect(display.some((c) => c.isCategoryGroup)).toBe(false);
    expect(display).toHaveLength(categories.length);
  });
});

describe("buildShopFilterPanelCategories", () => {
  const categories = [
    { id: 1, name: "Delivery by post", parent: null },
    { id: 2, name: "Meat Snacks", parent: 1 },
    { id: 3, name: "Sausages and Barbecue", parent: null },
    { id: 4, name: "Fresh Sausages", parent: 3 },
  ];

  const groups = [
    {
      id: 1,
      name: "Post delivery",
      category_ids: [1, 2],
      category_names: ["Delivery by post", "Meat Snacks"],
    },
  ];

  it("nests group members under a virtual parent and keeps ungrouped categories", () => {
    const panel = buildShopFilterPanelCategories(categories, groups);

    expect(panel.find((c) => c.id === shopFilterGroupParentId(1))).toMatchObject({
      name: "Post delivery",
      parent: null,
    });
    expect(panel.find((c) => c.id === 2)).toMatchObject({
      parent: shopFilterGroupParentId(1),
    });
    expect(panel.find((c) => c.id === 3)).toMatchObject({
      name: "Sausages and Barbecue",
      parent: null,
    });
    expect(panel.find((c) => c.id === 4)).toMatchObject({
      parent: 3,
    });
    expect(panel.find((c) => c.id === 1)).toBeUndefined();
  });

  it("keeps a parent category when it has ungrouped children", () => {
    const panel = buildShopFilterPanelCategories(
      [
        { id: 1, name: "Delivery by post", parent: null },
        { id: 2, name: "Meat Snacks", parent: 10 },
        { id: 10, name: "Sausages and Barbecue", parent: null },
        { id: 11, name: "Fresh Sausages", parent: 10 },
      ],
      [
        {
          id: 1,
          name: "Delivery by post",
          category_ids: [2],
          category_names: ["Meat Snacks"],
        },
      ]
    );

    expect(panel.find((c) => c.id === 10)).toMatchObject({
      name: "Sausages and Barbecue",
      parent: null,
    });
    expect(panel.find((c) => c.id === 11)).toMatchObject({
      parent: 10,
    });
    expect(panel.find((c) => c.id === 2)).toMatchObject({
      parent: shopFilterGroupParentId(1),
    });
  });

  it("does not show a standalone parent when only its children are grouped", () => {
    const panel = buildShopFilterPanelCategories(
      [
        { id: 1, name: "Delivery by post", parent: null },
        { id: 2, name: "Meat Snacks", parent: 1 },
        { id: 3, name: "Pork Fat", parent: 1 },
      ],
      [
        {
          id: 1,
          name: "Delivery by post",
          category_ids: [2, 3],
          category_names: ["Meat Snacks", "Pork Fat"],
        },
      ]
    );

    expect(panel.filter((c) => c.parent == null).map((c) => c.name)).toEqual([
      "Delivery by post",
    ]);
    expect(panel.find((c) => c.id === 1)).toBeUndefined();
  });

  it("shows a category under every group it belongs to", () => {
    const flatCategories = [
      { id: 1, name: "Meat Snacks" },
      { id: 2, name: "Pork Fat" },
      { id: 3, name: "Bakery" },
    ];
    const twoGroups: ApiCategoryGroup[] = [
      { id: 1, name: "Group A", category_ids: [1] },
      { id: 2, name: "Group B", category_ids: [1, 2] },
    ];
    const panel = buildShopFilterPanelCategories(flatCategories, twoGroups);

    const cat1Rows = panel.filter((c) => c.id === 1);
    expect(cat1Rows).toHaveLength(2);
    expect(cat1Rows.map((c) => c.parent).sort()).toEqual(
      [shopFilterGroupParentId(1), shopFilterGroupParentId(2)].sort()
    );
    expect(panel.find((c) => c.id === 2)).toMatchObject({
      parent: shopFilterGroupParentId(2),
    });
    expect(panel.find((c) => c.id === 3)).toMatchObject({ parent: null });
    expect(panel.some((c) => c.id === 1 && c.parent == null)).toBe(false);
  });

  it("skips a group whose members are not in the category list", () => {
    const panel = buildShopFilterPanelCategories(
      [
        { id: 1, name: "Meat Snacks" },
        { id: 2, name: "Pork Fat" },
        { id: 3, name: "Bakery" },
      ],
      [{ id: 9, name: "Ghost group", category_ids: [999] }]
    );
    expect(panel.some((c) => c.id === shopFilterGroupParentId(9))).toBe(false);
    expect(panel).toHaveLength(3);
  });
});
