/** Product shape returned from `/api/products/:id/` for wishlist display. */
export interface WishlistProduct {
  id: number;
  name: string;
  description?: string;
  price: string;
  categories?: string[];
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
  original_price?: string;
  discount_percentage?: number;
  in_stock?: boolean;
  stock_quantity?: number;
}

export interface WishlistStatsData {
  totalItems: number;
  totalValue: number;
  categories: string[];
}
