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
