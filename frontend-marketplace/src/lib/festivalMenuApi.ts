import { getClientApiBaseUrl } from "@/config/api";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

export type FestivalMenuAddition = {
  name: string;
  price: string;
};

export type FestivalMenuFilling = {
  name: string;
  image: string;
  description: string;
  allergens: string;
};

export type FestivalMenuProduct = {
  name: string;
  category: string | null;
  image: string;
  price: string;
  portion: string;
  description: string;
  fillings: FestivalMenuFilling[];
  /** Backend addition class name, e.g. "Soft drinks". Null when no add-ons. */
  addition_class: string | null;
  additions: FestivalMenuAddition[];
  ingredients: string;
  toppings: string;
  allergens: string;
  created_at?: string;
};

export type FestivalMenuCategory = {
  name: string;
  products: FestivalMenuProduct[];
};

export type FestivalMenuResponse = {
  included_meal_offer: string;
  categories: FestivalMenuCategory[];
};

export type SplitMenuProducts = {
  withoutFillings: FestivalMenuProduct[];
  withFillings: FestivalMenuProduct[];
};

/** Keep simple products and filling-based products in separate menu groups. */
export function splitMenuProducts(
  products: FestivalMenuProduct[]
): SplitMenuProducts {
  const withoutFillings: FestivalMenuProduct[] = [];
  const withFillings: FestivalMenuProduct[] = [];

  for (const product of products) {
    if (product.fillings.length > 0) {
      withFillings.push(product);
    } else {
      withoutFillings.push(product);
    }
  }

  return { withoutFillings, withFillings };
}

export function countMenuItems(products: FestivalMenuProduct[]): number {
  return products.reduce(
    (sum, product) =>
      sum + (product.fillings.length > 0 ? product.fillings.length : 1),
    0
  );
}

const MENU_FETCH_TIMEOUT_MS = 15_000;

export async function fetchFestivalMenu(): Promise<FestivalMenuResponse> {
  const response = await fetchWithTimeout(
    `${getClientApiBaseUrl()}/api/festival/menu/`,
    {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    },
    MENU_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error("Could not load the festival menu. Please try again shortly.");
  }

  return response.json() as Promise<FestivalMenuResponse>;
}

export { formatFestivalMoney } from "@/lib/festivalApi";
