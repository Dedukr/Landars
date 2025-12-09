"use client";
import { useState, useCallback, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

export const useCartItems = (products: Product[]) => {
  const { removeItem, updateQuantity, cart } = useCart();
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());

  // Optimized remove function that only updates the specific item
  const removeItemOptimized = useCallback(
    (productId: number) => {
      // Add to removing set for animation
      setRemovingIds((prev) => new Set(prev).add(productId));

      // Remove from cart context
      removeItem(productId);

      // Clean up removing state after animation
      setTimeout(() => {
        setRemovingIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      }, 300);
    },
    [removeItem]
  );

  // Optimized quantity decrease function
  const decreaseQuantity = useCallback(
    (productId: number) => {
      // Add to removing set for animation if quantity becomes 0
      const cartItem = cart.find((item) => item.productId === productId);
      if (cartItem && cartItem.quantity <= 1) {
        setRemovingIds((prev) => new Set(prev).add(productId));

        // Remove from cart context
        removeItem(productId);

        // Clean up removing state after animation
        setTimeout(() => {
          setRemovingIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(productId);
            return newSet;
          });
        }, 300);
      } else if (cartItem) {
        // Use updateQuantity for direct quantity updates
        updateQuantity(productId, cartItem.quantity - 1);
      }
    },
    [removeItem, updateQuantity, cart]
  );

  // Optimized quantity increase function
  const increaseQuantity = useCallback(
    (productId: number) => {
      const cartItem = cart.find((item) => item.productId === productId);
      if (cartItem) {
        // Use updateQuantity for direct quantity updates
        updateQuantity(productId, cartItem.quantity + 1);
      } else {
        // Use updateQuantity to add new item (it handles both cases)
        updateQuantity(productId, 1);
      }
    },
    [updateQuantity, cart]
  );

  // Memoized filtered products - filter out items that are being removed OR not in cart
  const filteredProducts = useMemo(() => {
    const cartProductIds = cart.map((item) => item.productId);
    return products.filter(
      (product) =>
        !removingIds.has(product.id) && cartProductIds.includes(product.id)
    );
  }, [products, removingIds, cart]);

  return {
    filteredProducts,
    removingIds,
    removeItem: removeItemOptimized,
    decreaseQuantity,
    increaseQuantity,
  };
};
