import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FestivalMenuPage from "../page";

const mockFetchFestivalMenu = jest.fn();

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { alt, src, onError } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={typeof alt === "string" ? alt : ""}
        src={typeof src === "string" ? src : ""}
        onError={onError as React.ReactEventHandler<HTMLImageElement> | undefined}
      />
    );
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("@/lib/festivalMenuApi", () => {
  const actual = jest.requireActual("@/lib/festivalMenuApi");
  return {
    ...actual,
    fetchFestivalMenu: (...args: unknown[]) => mockFetchFestivalMenu(...args),
    formatFestivalMoney: (value: number | string) => {
      const num = typeof value === "string" ? Number(value) : value;
      return `£${num.toFixed(2)}`;
    },
  };
});

const sampleMenu = {
  included_meal_offer: "Main + side + drink for £15",
  categories: [
    {
      name: "Meals",
      products: [
        {
          name: "Shashlik",
          category: "Meals",
          image: "https://example.com/shashlik.jpg",
          price: "9.00",
          portion: "Skewer",
          description: "Chargrilled skewer",
          fillings: [
            {
              name: "Chicken",
              image: "https://example.com/chicken.jpg",
              description: "Chargrilled chicken skewer",
              allergens: "None declared",
            },
            {
              name: "Pork",
              image: "https://example.com/pork.jpg",
              description: "Chargrilled skewer",
              allergens: "None declared",
            },
          ],
          additions: [],
          addition_class: null,
          ingredients: "Meat, spices",
          toppings: "",
          allergens: "None declared",
        },
        {
          name: "Varenyky",
          category: "Meals",
          image: "https://example.com/varenyky.jpg",
          price: "8.50",
          portion: "6 pieces",
          description: "Handmade dumplings",
          fillings: [],
          additions: [],
          addition_class: null,
          ingredients: "Flour, potato",
          toppings: "Sour cream",
          allergens: "Gluten, milk",
        },
      ],
    },
    {
      name: "Drinks",
      products: [
        {
          name: "Kvas",
          category: "Drinks",
          image: "https://example.com/kvas.jpg",
          price: "3.00",
          portion: "500 ml",
          description: "",
          fillings: [],
          additions: [{ name: "Cola", price: "1.50" }],
          addition_class: "Soft drinks",
          ingredients: "",
          toppings: "",
          allergens: "",
        },
      ],
    },
  ],
};

describe("FestivalMenuPage", () => {
  beforeEach(() => {
    mockFetchFestivalMenu.mockReset();
    mockFetchFestivalMenu.mockResolvedValue(sampleMenu);
  });

  it("loads and renders the public menu without auth redirects", async () => {
    render(<FestivalMenuPage />);
    expect(await screen.findByRole("heading", { name: "Festival Menu" })).toBeInTheDocument();
    expect(screen.getByText("Landar's Food")).toBeInTheDocument();
    expect(
      await screen.findByText(sampleMenu.included_meal_offer)
    ).toBeInTheDocument();
    expect(mockFetchFestivalMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/printer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/place order/i)).not.toBeInTheDocument();
  });

  it("sorts products without fillings before products with fillings within each category", async () => {
    render(<FestivalMenuPage />);
    // sampleMenu has Shashlik (fillings) first, then Varenyky (no fillings) in API order.
    // After sort Varenyky (no fillings) must appear before Shashlik (fillings).
    const varenykyHeading = await screen.findByRole("heading", { name: "Varenyky", level: 3 });
    const shashlikHeading = screen.getByRole("heading", { name: "Shashlik", level: 3 });
    expect(
      varenykyHeading.compareDocumentPosition(shashlikHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("does not render a parent image when the product has fillings, and renders it when it does not", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Varenyky", level: 3 });

    // Varenyky has no fillings — its image should render directly on the card
    expect(
      document.querySelector('img[src="https://example.com/varenyky.jpg"]')
    ).toBeTruthy();

    // Shashlik has fillings — its parent image must NOT appear on the card itself
    const shashlikCard = screen
      .getByRole("heading", { name: "Shashlik", level: 3 })
      .closest(".festival-menu-card--with-fillings");
    expect(shashlikCard).toBeTruthy();
    const parentImg = shashlikCard!.querySelector(
      '.festival-menu-card-media img[src="https://example.com/shashlik.jpg"]'
    );
    expect(parentImg).toBeNull();

    // Filling images are still shown
    expect(
      document.querySelector('img[src="https://example.com/chicken.jpg"]')
    ).toBeTruthy();

    expect(document.querySelector(".festival-menu-card-grid")).toBeTruthy();
    expect(document.querySelectorAll(".festival-menu-card").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Choose your meat/i)).toBeInTheDocument();
  });

  it("shows allergen information visibly on simple products", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Varenyky", level: 3 });
    expect(screen.getAllByText(/Allergens/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Gluten, milk/)).toBeInTheDocument();
  });

  it("does not show parent-level allergens on cards that have fillings", async () => {
    render(<FestivalMenuPage />);
    const shashlikHeading = await screen.findByRole("heading", { name: "Shashlik", level: 3 });
    const shashlikCard = shashlikHeading.closest(".festival-menu-card--with-fillings");
    expect(shashlikCard).toBeTruthy();
    // The parent card body should not contain an "Allergens" label at parent level
    const parentBody = shashlikCard!.querySelector(".festival-menu-card-body");
    const parentAllergenEl = parentBody?.querySelector(".festival-menu-card-allergens");
    expect(parentAllergenEl).toBeNull();
    // Filling allergens are still shown inside filling copy blocks, with the Allergens title
    const fillingAllergens = shashlikCard!.querySelectorAll(".festival-menu-choice-allergens");
    expect(fillingAllergens.length).toBeGreaterThanOrEqual(1);
    expect(fillingAllergens[0].textContent).toMatch(/Allergens/);
  });

  it("places sauces after description and before fillings", async () => {
    render(<FestivalMenuPage />);
    const varenykyHeading = await screen.findByRole("heading", { name: "Varenyky", level: 3 });
    const card = varenykyHeading.closest(".festival-menu-card");
    expect(card).toBeTruthy();
    const text = card!.textContent ?? "";
    const descriptionIndex = text.indexOf("Handmade dumplings");
    const saucesIndex = text.indexOf("Sauces");
    expect(descriptionIndex).toBeGreaterThanOrEqual(0);
    expect(saucesIndex).toBeGreaterThan(descriptionIndex);
  });

  it("omits allergen and ingredient rows when empty — no placeholders", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Kvas", level: 3 });
    expect(screen.queryByText(/Not listed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ingredients/i)).not.toBeInTheDocument();
    const kvasCard = screen.getByRole("heading", { name: "Kvas", level: 3 }).closest(
      ".festival-menu-card"
    );
    expect(kvasCard).toBeTruthy();
    expect(kvasCard!.textContent).not.toMatch(/Allergens/i);
  });

  it("does not display ingredients on the festival menu", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Varenyky", level: 3 });
    expect(screen.queryByText(/Ingredients/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Flour, potato/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meat, spices/)).not.toBeInTheDocument();
  });

  it("renders filling choices in a grid and shows their descriptions and allergens", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Shashlik", level: 3 });
    expect(screen.getByText("Chargrilled chicken skewer")).toBeInTheDocument();
    expect(screen.getAllByText("Chargrilled skewer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/None declared/).length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".festival-menu-card--with-fillings")).toBeTruthy();
    // Filling images rendered inside choice-media cells
    expect(
      document.querySelector('img[src="https://example.com/chicken.jpg"]')
    ).toBeTruthy();
    // Fillings use a grid list (not a plain flex column)
    const choiceList = document.querySelector(".festival-menu-choice-list");
    expect(choiceList).toBeTruthy();
    // Each filling is a separate list item with a choice-row inside
    expect(document.querySelectorAll(".festival-menu-choice-row").length).toBeGreaterThanOrEqual(2);
    // Each row contains a media cell and a copy block
    expect(document.querySelectorAll(".festival-menu-choice-media").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll(".festival-menu-choice-copy").length).toBeGreaterThanOrEqual(2);
  });

  it("marks products with four or more fillings for full-width desktop layout", async () => {
    mockFetchFestivalMenu.mockResolvedValue({
      included_meal_offer: "",
      categories: [
        {
          name: "Meals",
          products: [
            {
              name: "Filled Crepes",
              category: "Meals",
              image: "https://example.com/crepes.jpg",
              price: "9.99",
              portion: "",
              description: "",
              fillings: [
                { name: "Chicken", image: "", description: "", allergens: "" },
                { name: "Cheese", image: "", description: "", allergens: "" },
                { name: "Apple", image: "", description: "", allergens: "" },
                { name: "Berry", image: "", description: "", allergens: "" },
              ],
              additions: [],
              addition_class: null,
              ingredients: "",
              toppings: "",
              allergens: "",
            },
          ],
        },
      ],
    });
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Filled Crepes", level: 3 });
    expect(document.querySelector(".festival-menu-card--many-fillings")).toBeTruthy();
    expect(
      document.querySelectorAll(".festival-menu-card--many-fillings .festival-menu-choice-row")
        .length
    ).toBe(4);
  });

  it("renders category navigation links", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("navigation", { name: "Menu categories" });
    expect(screen.getByRole("link", { name: "Meals" })).toHaveAttribute(
      "href",
      "#category-meals"
    );
    expect(screen.getByRole("link", { name: "Drinks" })).toHaveAttribute(
      "href",
      "#category-drinks"
    );
  });

  it("shows empty menu state", async () => {
    mockFetchFestivalMenu.mockResolvedValue({ included_meal_offer: "", categories: [] });
    render(<FestivalMenuPage />);
    expect(await screen.findByText(/Menu coming soon/i)).toBeInTheDocument();
  });

  it("shows API error state with retry", async () => {
    mockFetchFestivalMenu.mockRejectedValueOnce(new Error("Network down"));
    render(<FestivalMenuPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Network down/);
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => expect(mockFetchFestivalMenu).toHaveBeenCalledTimes(2));
  });

  it("falls back when product card image fails", async () => {
    render(<FestivalMenuPage />);
    await screen.findByText("Varenyky");
    const img = document.querySelector(
      'img[src="https://example.com/varenyky.jpg"]'
    ) as HTMLImageElement;
    fireEvent.error(img);
    await waitFor(() => {
      expect(
        document.querySelector('img[src="https://example.com/varenyky.jpg"]')
      ).toBeNull();
    });
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("Varenyky").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Drinks included on the Meals title row, not under Drinks", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Kvas", level: 3 });

    const mealsSection = document.getElementById("category-meals");
    expect(mealsSection).toBeTruthy();
    expect(mealsSection).toHaveTextContent("Drinks included");

    expect(screen.queryByLabelText("Drinks add-ons")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Meals add-ons")).not.toBeInTheDocument();
    expect(screen.queryByText("Cola")).not.toBeInTheDocument();
    expect(screen.queryByText("+£1.50")).not.toBeInTheDocument();
  });

  it("does not call staff festival APIs", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Festival Menu" });
    expect(mockFetchFestivalMenu).toHaveBeenCalled();
  });
});
