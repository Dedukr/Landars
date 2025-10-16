"use client";
import React, { memo, useCallback } from "react";
import CartItem from "./CartItem";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

interface CartItemsListProps {
  products: Product[];
  cart: Array<{ productId: number; quantity: number }>;
  removingIds: Set<number>;
  onRemove: (productId: number) => void;
  onDecreaseQuantity: (productId: number) => void;
  onIncreaseQuantity: (productId: number) => void;
  onSaveForLater: (productId: number) => void;
}

const CartItemsList = memo<CartItemsListProps>(
  ({
    products,
    cart,
    removingIds,
    onRemove,
    onDecreaseQuantity,
    onIncreaseQuantity,
    onSaveForLater,
  }) => {
    const handleSaveForLater = useCallback(
      (productId: number) => {
        onSaveForLater(productId);
      },
      [onSaveForLater]
    );

    return (
      <div
        className="rounded-lg shadow-sm overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
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
            Cart Items
          </h2>
        </div>
        <div style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          {products.map((product) => {
            const cartItem = cart.find((item) => item.productId === product.id);
            if (!cartItem) return null;

            return (
              <CartItem
                key={product.id}
                product={product}
                quantity={cartItem.quantity}
                isRemoving={removingIds.has(product.id)}
                onRemove={onRemove}
                onDecreaseQuantity={onDecreaseQuantity}
                onIncreaseQuantity={onIncreaseQuantity}
                onSaveForLater={handleSaveForLater}
              />
            );
          })}
        </div>
      </div>
    );
  }
);

CartItemsList.displayName = "CartItemsList";

export default CartItemsList;
