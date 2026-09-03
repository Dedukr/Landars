import {
  additionsOptionCategory,
  collectCategoryAdditionGroups,
  entryImageSide,
  expandCategoryProducts,
  fillingsOptionCategory,
  fillingChoiceLabel,
  formatCategoryAdditionSummary,
  menuHasDrinkAdditions,
  nonDrinkAdditionGroups,
  partitionCategoryProducts,
} from "../utils";
import type { FestivalMenuProduct } from "@/lib/festivalMenuApi";

describe("entryImageSide", () => {
  it("alternates left and right by index", () => {
    expect(entryImageSide(0)).toBe("left");
    expect(entryImageSide(1)).toBe("right");
    expect(entryImageSide(2)).toBe("left");
  });
});

describe("fillingsOptionCategory", () => {
  it("returns null for empty fillings", () => {
    expect(fillingsOptionCategory([])).toBeNull();
  });

  it("groups fillings under a Fillings label", () => {
    const fillings = [
      { name: "Chicken", image: "", description: "", allergens: "" },
      { name: "Pork", image: "", description: "", allergens: "" },
    ];
    expect(fillingsOptionCategory(fillings)).toEqual({
      label: "Fillings",
      options: fillings,
    });
  });
});

describe("additionsOptionCategory", () => {
  it("returns null for empty additions", () => {
    expect(additionsOptionCategory([])).toBeNull();
  });

  it("groups additions under Add-ons label when no class name", () => {
    const additions = [{ name: "Cola", price: "1.50" }];
    expect(additionsOptionCategory(additions)).toEqual({
      label: "Add-ons",
      options: additions,
    });
  });

  it("uses backend addition class name when provided", () => {
    const additions = [{ name: "Cola", price: "1.50" }];
    expect(additionsOptionCategory(additions, "Soft drinks")).toEqual({
      label: "Soft drinks",
      options: additions,
    });
  });
});

describe("partitionCategoryProducts", () => {
  const simple: FestivalMenuProduct = {
    name: "Varenyky",
    category: "Meals",
    image: "",
    price: "8.50",
    portion: "",
    description: "",
    fillings: [],
    addition_class: null,
    additions: [],
    ingredients: "",
    toppings: "",
    allergens: "",
  };

  const withFillings: FestivalMenuProduct = {
    name: "Shashlik",
    category: "Meals",
    image: "",
    price: "9.00",
    portion: "",
    description: "",
    fillings: [{ name: "Chicken", image: "", description: "", allergens: "" }],
    addition_class: null,
    additions: [],
    ingredients: "",
    toppings: "",
    allergens: "",
  };

  it("separates simple products from filling-based products", () => {
    expect(partitionCategoryProducts([withFillings, simple])).toEqual({
      simpleProducts: [simple],
      fillingProducts: [withFillings],
    });
  });
});

describe("expandCategoryProducts", () => {
  const baseProduct: FestivalMenuProduct = {
    name: "Shashlik",
    category: "Meals",
    image: "https://example.com/shashlik.jpg",
    price: "9.00",
    portion: "Skewer",
    description: "Chargrilled skewer",
    fillings: [],
    addition_class: null,
    additions: [],
    ingredients: "",
    toppings: "",
    allergens: "",
  };

  it("returns one card for products without fillings", () => {
    expect(expandCategoryProducts([baseProduct])).toEqual([
      { key: "Shashlik", product: baseProduct, filling: null },
    ]);
  });

  it("returns one card per filling", () => {
    const withFillings = {
      ...baseProduct,
      fillings: [
        { name: "Chicken", image: "https://example.com/chicken.jpg", description: "", allergens: "" },
        { name: "Pork", image: "https://example.com/pork.jpg", description: "", allergens: "" },
      ],
    };
    const items = expandCategoryProducts([withFillings]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      key: "Shashlik:Chicken",
      filling: { name: "Chicken", image: "https://example.com/chicken.jpg", description: "", allergens: "" },
    });
    expect(items[1]).toMatchObject({
      key: "Shashlik:Pork",
      filling: { name: "Pork", image: "https://example.com/pork.jpg", description: "", allergens: "" },
    });
  });
});

describe("collectCategoryAdditionGroups", () => {
  const drinkProduct = (
    name: string,
    additions: { name: string; price: string }[]
  ): FestivalMenuProduct => ({
    name,
    category: "Drinks",
    image: "",
    price: "3.00",
    portion: "",
    description: "",
    fillings: [],
    addition_class: "Soft drinks",
    additions,
    ingredients: "",
    toppings: "",
    allergens: "",
  });

  it("returns empty array when no products have additions", () => {
    expect(
      collectCategoryAdditionGroups([
        drinkProduct("Kvas", []),
      ])
    ).toEqual([]);
  });

  it("deduplicates additions across products in the same class", () => {
    const groups = collectCategoryAdditionGroups([
      drinkProduct("Kvas", [{ name: "Cola", price: "1.50" }]),
      drinkProduct("Kompot", [{ name: "Cola", price: "1.50" }, { name: "Fanta", price: "1.50" }]),
    ]);
    expect(groups).toEqual([
      {
        label: "Soft drinks",
        options: [
          { name: "Cola", price: "1.50" },
          { name: "Fanta", price: "1.50" },
        ],
      },
    ]);
  });
});

describe("fillingChoiceLabel", () => {
  it("uses Choose your meat for shashlik", () => {
    expect(
      fillingChoiceLabel("Shashlik", [{ name: "Chicken", image: "", description: "", allergens: "" }])
    ).toBe("Choose your meat");
  });

  it("uses Choose your variety for jerky", () => {
    expect(
      fillingChoiceLabel("Jerky", [{ name: "Beef", image: "", description: "", allergens: "" }])
    ).toBe("Choose your variety");
  });

  it("uses Choose your filling by default", () => {
    expect(
      fillingChoiceLabel("Chebureki", [{ name: "Beef", image: "", description: "", allergens: "" }])
    ).toBe("Choose your filling");
  });
});

describe("formatCategoryAdditionSummary", () => {
  it("uses Drinks included for drink-related classes", () => {
    expect(formatCategoryAdditionSummary("Soft drinks")).toBe("Drinks included");
  });

  it("uses generic included copy for other classes", () => {
    expect(formatCategoryAdditionSummary("Sides")).toBe("Sides included");
  });
});

describe("menuHasDrinkAdditions", () => {
  it("returns true when menu has drink addition classes", () => {
    expect(
      menuHasDrinkAdditions([
        {
          name: "Kvas",
          category: "Drinks",
          image: "",
          price: "3.00",
          portion: "",
          description: "",
          fillings: [],
          addition_class: "Soft drinks",
          additions: [{ name: "Cola", price: "1.50" }],
          ingredients: "",
          toppings: "",
          allergens: "",
        },
      ])
    ).toBe(true);
  });
});

describe("nonDrinkAdditionGroups", () => {
  it("filters out drink-related groups", () => {
    expect(
      nonDrinkAdditionGroups([
        { label: "Soft drinks", options: [{ name: "Cola", price: "1.50" }] },
        { label: "Sides", options: [{ name: "Fries", price: "2.00" }] },
      ])
    ).toEqual([{ label: "Sides", options: [{ name: "Fries", price: "2.00" }] }]);
  });
});
