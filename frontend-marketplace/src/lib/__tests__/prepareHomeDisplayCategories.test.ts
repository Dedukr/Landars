import {
  buildShopByCategoryDisplay,
  buildShopFilterPanelCategories,
  shopFilterGroupParentId,
  type ApiCategory,
  type ApiCategoryGroup,
} from "@/lib/prepareHomeDisplayCategories";

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
    { id: 1, name: "Meat Snacks" },
    { id: 2, name: "Pork Fat" },
    { id: 3, name: "Bakery" },
  ];

  const groups: ApiCategoryGroup[] = [
    {
      id: 1,
      name: "Delivery by post",
      category_ids: [1, 2],
      category_names: ["Meat Snacks", "Pork Fat"],
    },
  ];

  it("nests group members under a virtual parent row", () => {
    const panel = buildShopFilterPanelCategories(categories, groups);

    expect(panel.find((c) => c.id === shopFilterGroupParentId(1))).toMatchObject({
      name: "Delivery by post",
      parent: null,
    });
    expect(panel.find((c) => c.id === 1)).toMatchObject({
      name: "Meat Snacks",
      parent: shopFilterGroupParentId(1),
    });
    expect(panel.find((c) => c.id === 2)).toMatchObject({
      name: "Pork Fat",
      parent: shopFilterGroupParentId(1),
    });
  });

  it("keeps ungrouped categories as standalone root rows", () => {
    const panel = buildShopFilterPanelCategories(categories, groups);
    expect(panel.find((c) => c.id === 3)).toMatchObject({
      name: "Bakery",
      parent: null,
    });
  });

  it("shows a category under every group it belongs to (no exclusivity)", () => {
    const twoGroups: ApiCategoryGroup[] = [
      { id: 1, name: "Group A", category_ids: [1] },
      { id: 2, name: "Group B", category_ids: [1, 2] },
    ];
    const panel = buildShopFilterPanelCategories(categories, twoGroups);

    const matchesForCat1 = panel.filter((c) => c.id === 1);
    expect(matchesForCat1).toHaveLength(2);
    expect(matchesForCat1.map((c) => c.parent).sort()).toEqual(
      [shopFilterGroupParentId(1), shopFilterGroupParentId(2)].sort()
    );

    // Cat 1 belongs to a group, so it must not also show up as a standalone root row.
    expect(
      panel.some((c) => c.id === 1 && c.parent == null)
    ).toBe(false);
  });

  it("excludes a multi-group category from the ungrouped root list but keeps a single-group one", () => {
    const twoGroups: ApiCategoryGroup[] = [
      { id: 1, name: "Sausages and Barbecue", category_ids: [1, 2] },
      { id: 2, name: "Delivery by post", category_ids: [1] },
    ];
    const panel = buildShopFilterPanelCategories(categories, twoGroups);

    // Cat 1 is in both groups — appears twice, never at root.
    expect(panel.filter((c) => c.id === 1)).toHaveLength(2);
    // Cat 2 is only in "Sausages and Barbecue" — appears once, nested there.
    const cat2Rows = panel.filter((c) => c.id === 2);
    expect(cat2Rows).toHaveLength(1);
    expect(cat2Rows[0]).toMatchObject({ parent: shopFilterGroupParentId(1) });
    // Cat 3 ("Bakery") is in neither group — stays a standalone root row.
    expect(panel.find((c) => c.id === 3)).toMatchObject({ parent: null });
  });

  it("skips a group whose members are not in the category list", () => {
    const panel = buildShopFilterPanelCategories(categories, [
      { id: 9, name: "Ghost group", category_ids: [999] },
    ]);
    expect(panel.some((c) => c.id === shopFilterGroupParentId(9))).toBe(false);
    expect(panel).toHaveLength(categories.length);
  });
});
