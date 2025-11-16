"use client";
import React, { memo } from "react";

interface CartItemsCountDisplayProps {
  totalItems: number;
}

const CartItemsCountDisplay = memo<CartItemsCountDisplayProps>(({ totalItems }) => {
  return (
    <p
      className="mt-2"
      style={{ color: "var(--foreground)", opacity: 0.7 }}
    >
      {totalItems} {totalItems === 1 ? "item" : "items"} in your cart
    </p>
  );
});

CartItemsCountDisplay.displayName = "CartItemsCountDisplay";

export default CartItemsCountDisplay;
