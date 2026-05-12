"use client";
import React, { memo } from "react";
import CartItemCard from "./CartItemCard";
import { Package } from "lucide-react";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  images?: (string | { image_url: string })[];
  primary_image?: string | null;
  description?: string;
  categories?: string[];
}

interface CartItemListProps {
  products: Product[];
  cart: Array<{ productId: number; quantity: number }>;
  removingIds: Set<number>;
  onRemove: (productId: number) => void;
  onDecreaseQuantity: (productId: number) => void;
  onIncreaseQuantity: (productId: number) => void;
  onSaveForLater: (productId: number) => void;
}

const CartItemList = memo<CartItemListProps>(
  ({
    products,
    cart,
    removingIds,
    onRemove,
    onDecreaseQuantity,
    onIncreaseQuantity,
    onSaveForLater,
  }) => {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-5 py-4"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <Package
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--accent)" }}
            aria-hidden="true"
          />
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            Order items
          </h2>
        </div>

        {/* Items */}
        <div>
          {products.map((product) => {
            const cartItem = cart.find((item) => item.productId === product.id);
            if (!cartItem) return null;

            return (
              <CartItemCard
                key={product.id}
                product={product}
                quantity={cartItem.quantity}
                isRemoving={removingIds.has(product.id)}
                onRemove={onRemove}
                onDecreaseQuantity={onDecreaseQuantity}
                onIncreaseQuantity={onIncreaseQuantity}
                onSaveForLater={onSaveForLater}
              />
            );
          })}
        </div>
      </div>
    );
  }
);

CartItemList.displayName = "CartItemList";
export default CartItemList;
