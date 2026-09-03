import {
  countMenuItems,
  splitMenuProducts,
  type FestivalMenuProduct,
} from "@/lib/festivalMenuApi";

const baseProduct: FestivalMenuProduct = {
  name: "Shashlik",
  category: "Meals",
  image: "https://example.com/shashlik.jpg",
  price: "9.00",
  portion: "Skewer",
  description: "Chargrilled skewer",
  fillings: [],
  additions: [],
  addition_class: null,
  ingredients: "Meat, spices",
  toppings: "",
  allergens: "None declared",
};

describe("splitMenuProducts", () => {
  it("separates products with fillings from simple products", () => {
    const simple = { ...baseProduct, name: "Syrnyky" };
    const withFillings = {
      ...baseProduct,
      name: "Chebureki",
      fillings: [
        { name: "Beef&Pork", image: "https://example.com/beef.jpg", description: "", allergens: "" },
        { name: "Cheese&Greens", image: "https://example.com/cheese.jpg", description: "", allergens: "" },
      ],
    };

    const result = splitMenuProducts([simple, withFillings]);
    expect(result.withoutFillings).toEqual([simple]);
    expect(result.withFillings).toEqual([withFillings]);
  });
});

describe("countMenuItems", () => {
  it("counts one item per simple product and one per filling", () => {
    const count = countMenuItems([
      { ...baseProduct, name: "Syrnyky" },
      {
        ...baseProduct,
        fillings: [
          { name: "Chicken", image: "", description: "", allergens: "" },
          { name: "Pork", image: "", description: "", allergens: "" },
        ],
      },
    ]);
    expect(count).toBe(3);
  });
});
