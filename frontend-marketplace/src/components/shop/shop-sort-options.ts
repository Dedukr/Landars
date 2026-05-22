import type { SortOption } from "@/components/SortList";

/**
 * Backend-supported values: name_asc, name_desc, price_asc, price_desc,
 * created_at_desc, created_at_asc, sales_desc, sales_asc (ProductList APIView).
 * Use `SHOP_INITIAL_SORT` for initial/reset UI state (explicit name ascending).
 */
export const SHOP_INITIAL_SORT = "name_asc";

export const SHOP_SORT_OPTIONS: SortOption[] = [
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "sales_desc", label: "Most sold" },
  { value: "sales_asc", label: "Least sold" },
];
