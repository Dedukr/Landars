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

interface WishlistItemProps {
  product: Product;
  isRemoving: boolean;
  isSelected: boolean;
  onRemove: (productId: number) => void;
  onSelect: (productId: number, selected: boolean) => void;
}

const WishlistItem = memo<WishlistItemProps>(
  ({ product, isRemoving, isSelected, onRemove, onSelect }) => {
    const { addToCart } = useCart();

    const handleAddToCart = useCallback(() => {
      addToCart(product.id, 1);
    }, [addToCart, product.id]);

    const handleRemove = useCallback(() => {
      onRemove(product.id);
    }, [onRemove, product.id]);

    const handleSelectChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onSelect(product.id, e.target.checked);
      },
      [onSelect, product.id]
    );

    return (
      <div
        className={`p-6 transition-all duration-300 ${
          isRemoving
            ? "opacity-0 transform -translate-x-4 max-h-0 overflow-hidden"
            : "opacity-100 transform translate-x-0"
        }`}
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleSelectChange}
              className="h-4 w-4 rounded"
              style={{ accentColor: "var(--primary)" }}
            />
          </div>
          <div className="flex-shrink-0">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                width={80}
                height={80}
                className="w-20 h-20 object-cover rounded-lg"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-lg flex items-center justify-center"
                style={{ background: "var(--sidebar-bg)" }}
              >
                <span className="text-2xl">🍎</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-medium"
              style={{ color: "var(--foreground)" }}
            >
              {product.name}
            </h3>
            {product.description && (
              <p
                className="text-sm mt-1 line-clamp-2"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                {product.description}
              </p>
            )}
            {product.categories && product.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {product.categories.map((category, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: "var(--sidebar-bg)",
                      color: "var(--foreground)",
                    }}
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center space-x-4">
              <div
                className="text-lg font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                £{parseFloat(product.price).toFixed(2)}
              </div>
              {product.original_price &&
                parseFloat(product.original_price) >
                  parseFloat(product.price) && (
                  <div
                    className="text-sm line-through"
                    style={{
                      color: "var(--foreground)",
                      opacity: 0.5,
                    }}
                  >
                    £{parseFloat(product.original_price).toFixed(2)}
                  </div>
                )}
              {product.discount_percentage && (
                <span
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                  }}
                >
                  -{product.discount_percentage}%
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <button
              onClick={handleRemove}
              className="transition-colors"
              style={{ color: "#dc2626" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
              title="Remove from wishlist"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={handleAddToCart}
              className="px-4 py-2 text-white rounded-md transition-colors text-sm font-medium"
              style={{ background: "var(--primary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--primary)";
              }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    );
  }
);

WishlistItem.displayName = "WishlistItem";

export default WishlistItem;
