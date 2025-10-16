"use client";
import React, { memo, useCallback } from "react";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";

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
        className="mt-6 rounded-lg shadow-sm overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <div
          className="px-6 py-4"
          style={{
            borderBottom: "1px solid var(--sidebar-border)",
          }}
        >
          <h2
            className="text-lg font-medium"
            style={{ color: "var(--foreground)" }}
          >
            You might also like
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
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
                  style={{
                    color: "var(--foreground)",
                    opacity: 0.6,
                  }}
                >
                  £{product.price}
                </p>
                <button
                  onClick={() => handleAddToCart(product.id)}
                  className="mt-2 w-full px-3 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                >
                  Add to cart
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

CartRecommendations.displayName = "CartRecommendations";

export default CartRecommendations;
