"use client";
import React, { memo, useCallback } from "react";
import Image from "next/image";
import { useWishlist } from "@/contexts/WishlistContext";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

interface CartItemProps {
  product: Product;
  quantity: number;
  isRemoving: boolean;
  onRemove: (productId: number) => void;
  onDecreaseQuantity: (productId: number) => void;
  onIncreaseQuantity: (productId: number) => void;
  onSaveForLater: (productId: number) => void;
}

const CartItem = memo<CartItemProps>(
  ({
    product,
    quantity,
    isRemoving,
    onRemove,
    onDecreaseQuantity,
    onIncreaseQuantity,
    onSaveForLater,
  }) => {
    const { addToWishlist } = useWishlist();

    const handleSaveForLater = useCallback(async () => {
      try {
        await addToWishlist(product.id);
        onSaveForLater(product.id);
      } catch (error) {
        console.error("Failed to add to wishlist:", error);
      }
    }, [addToWishlist, product.id, onSaveForLater]);

    const getItemTotal = (productId: number, quantity: number) => {
      return parseFloat(product.price) * quantity;
    };

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
            {product?.image_url ? (
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
              {product?.name || "Product"}
            </h3>
            {product?.description && (
              <p
                className="text-sm mt-1 line-clamp-2"
                style={{
                  color: "var(--foreground)",
                  opacity: 0.6,
                }}
              >
                {product.description}
              </p>
            )}
            <div className="mt-2 flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onDecreaseQuantity(product.id)}
                  disabled={quantity <= 1}
                  className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--card-bg)",
                    color: "var(--foreground)",
                  }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.background = "var(--sidebar-bg)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.background = "var(--card-bg)";
                    }
                  }}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 12H4"
                    />
                  </svg>
                </button>
                <span className="w-8 text-center font-medium">{quantity}</span>
                <button
                  onClick={() => onIncreaseQuantity(product.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    background: "var(--card-bg)",
                    color: "var(--foreground)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--card-bg)";
                  }}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </button>
              </div>
              <div
                className="text-sm"
                style={{
                  color: "var(--foreground)",
                  opacity: 0.6,
                }}
              >
                £{product?.price} each
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <div
              className="text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              £{getItemTotal(product.id, quantity).toFixed(2)}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleSaveForLater}
                className="text-sm"
                style={{ color: "var(--primary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                Save for later
              </button>
              <button
                onClick={() => onRemove(product.id)}
                className="text-sm"
                style={{ color: "var(--destructive)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

CartItem.displayName = "CartItem";

export default CartItem;
