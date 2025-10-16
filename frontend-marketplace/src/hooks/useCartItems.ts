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
  const { removeFromCart, removeItem, addToCart, cart } = useCart();
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
      } else {
        // Just decrease quantity
        removeFromCart(productId);
      }
    },
    [removeFromCart, removeItem, cart]
  );

  // Optimized quantity increase function
  const increaseQuantity = useCallback(
    (productId: number) => {
      addToCart(productId, 1);
    },
    [addToCart]
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
