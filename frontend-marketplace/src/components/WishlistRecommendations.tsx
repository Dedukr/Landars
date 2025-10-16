"use client";
import React, { memo, useCallback } from "react";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";

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
    const { addToCart } = useCart();

    const handleAddToCart = useCallback(
      (productId: number) => {
        addToCart(productId, 1);
      },
      [addToCart]
    );

    if (recommendations.length === 0) return null;

    return (
      <div
        className="mt-8 rounded-lg shadow-sm overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="px-6 py-4"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <h2
            className="text-lg font-medium"
            style={{ color: "var(--foreground)" }}
          >
            You might also like
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {recommendations.map((product) => (
              <div key={product.id} className="text-center">
                <div className="aspect-square mb-2">
                  {product.image_url ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      width={120}
                      height={120}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-lg flex items-center justify-center"
                      style={{ background: "var(--sidebar-bg)" }}
                    >
                      <span className="text-2xl">🍎</span>
                    </div>
                  )}
                </div>
                <h3
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--foreground)" }}
                >
                  {product.name}
                </h3>
                <p
                  className="text-sm"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  £{product.price}
                </p>
                <button
                  onClick={() => handleAddToCart(product.id)}
                  className="mt-2 w-full px-3 py-1 text-xs font-medium rounded transition-colors"
                  style={{
                    color: "var(--accent)",
                    border: "1px solid var(--accent)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--accent)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--accent)";
                  }}
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

WishlistRecommendations.displayName = "WishlistRecommendations";

export default WishlistRecommendations;
