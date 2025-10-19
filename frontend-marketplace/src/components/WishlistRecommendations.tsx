"use client";
import React, { memo } from "react";
import ProductRecommendations from "./ProductRecommendations";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  categories?: string[];
  image_url?: string | null;
  original_price?: string;
  discount_percentage?: number;
  in_stock?: boolean;
  stock_quantity?: number;
}

interface WishlistRecommendationsProps {
  recommendations: Product[];
}

const WishlistRecommendations = memo<WishlistRecommendationsProps>(
  ({ recommendations }) => {
    if (recommendations.length === 0) return null;

    return (
      <ProductRecommendations
        excludeProducts={recommendations}
        title="You might also like"
        showWishlist={false}
        showQuickAdd={true}
        gridCols={{ default: 2, md: 3, lg: 6 }}
        className="mt-8"
      />
    );
  }
);

WishlistRecommendations.displayName = "WishlistRecommendations";

export default WishlistRecommendations;
