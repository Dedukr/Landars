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

  it("lists simple products first, then product groups with filling cards", async () => {
    render(<FestivalMenuPage />);
    expect(await screen.findByRole("heading", { name: "Varenyky", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shashlik", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chicken", level: 4 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pork", level: 4 })).toBeInTheDocument();
    expect(screen.getByLabelText("Shashlik fillings")).toBeInTheDocument();

    const varenykyHeading = screen.getByRole("heading", { name: "Varenyky", level: 3 });
    const shashlikGroupHeading = screen.getByRole("heading", { name: "Shashlik", level: 3 });
    expect(
      varenykyHeading.compareDocumentPosition(shashlikGroupHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    expect(
      document.querySelector('img[src="https://example.com/chicken.jpg"]')
    ).toBeTruthy();
    expect(
      document.querySelector('img[src="https://example.com/varenyky.jpg"]')
    ).toBeTruthy();
    expect(document.querySelector(".festival-menu-simple-products")).toBeTruthy();
    expect(document.querySelector(".festival-menu-entry-groups")).toBeTruthy();
    expect(screen.getByText(/Choose your meat/i)).toBeInTheDocument();
  });

  it("shows allergen information visibly on simple products", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Varenyky", level: 3 });
    expect(screen.getAllByText(/Allergens/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Gluten, milk/)).toBeInTheDocument();
  });

  it("shows description and allergens on filling cards", async () => {
    render(<FestivalMenuPage />);
    await screen.findByRole("heading", { name: "Chicken", level: 4 });
    expect(screen.getByText("Chargrilled chicken skewer")).toBeInTheDocument();
    expect(screen.getAllByText("Chargrilled skewer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/None declared/).length).toBeGreaterThanOrEqual(2);
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
