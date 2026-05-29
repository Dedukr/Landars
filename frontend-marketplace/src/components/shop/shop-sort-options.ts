import type { SortOption } from "@/components/SortList";

/**
 * Backend-supported values: name_asc, name_desc, price_asc, price_desc,
 * created_at_desc, created_at_asc, sales_desc, category_asc (ProductList APIView).
 * `SHOP_INITIAL_SORT` is the default shop listing order.
 */
export const SHOP_INITIAL_SORT = "name_asc";
export const SHOP_CATEGORY_SORT = "category_asc";

export const SHOP_SORT_OPTIONS: SortOption[] = [
  { value: "sales_desc", label: "Featured" },
  { value: "category_asc", label: "Categories" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
