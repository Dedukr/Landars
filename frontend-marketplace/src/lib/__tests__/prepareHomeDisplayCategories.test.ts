import {
  buildShopFilterPanelCategories,
  shopFilterGroupParentId,
} from "@/lib/prepareHomeDisplayCategories";

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
});
