"use client";
import React, { memo } from "react";
import ProductRecommendations from "./ProductRecommendations";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

interface CartRecommendationsProps {
  recommendations: Product[];
}

const CartRecommendations = memo<CartRecommendationsProps>(
  ({ recommendations }) => {
    if (recommendations.length === 0) return null;

    return (
      <ProductRecommendations
        excludeProducts={recommendations}
        title="You might also like"
        showWishlist={false}
        showQuickAdd={true}
        gridCols={{ default: 2, md: 4 }}
        className="mt-6"
      />
    );
  }
);

CartRecommendations.displayName = "CartRecommendations";

export default CartRecommendations;
