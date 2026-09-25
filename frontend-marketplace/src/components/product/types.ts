/** Promo definition from the API; absent when the product is not in a promotion. */
export interface ProductPromo {
  group?: string;
  label?: string;
  description?: string;
  group_size?: number;
  free_per_group?: number;
  paid_per_group?: number;
  badge?: string;
}

/** Product shape from GET /api/products/:id/ (aligned with shop listing where possible). */
export interface ProductDetail {
  id: number;
  name: string;
  description?: string | undefined;
  price: string;
  image_url?: string | null;
  images?: Array<{ image_url: string; sort_order?: number }> | string[];
  primary_image?: string | null;
  stock_quantity?: number;
  in_stock?: boolean;
  categories?: string[];
  sold_quantity?: number;
  sold_orders_count?: number;
  promo_group?: string;
  promo?: ProductPromo | null;
  category?: {
    id: number;
    name: string;
  };
  specifications?: Record<string, string>;
  nutrition_info?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  allergens?: string[];
  ingredients?: string[];
  storage_instructions?: string;
  shelf_life?: string;
}
