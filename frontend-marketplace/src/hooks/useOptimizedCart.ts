"use client";
import { useCallback, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";

/**
 * Optimized cart hook that provides memoized cart operations
 * to prevent unnecessary re-renders in components
 */
export const useOptimizedCart = () => {
  const cartContext = useCart();

  // Memoize cart operations to prevent unnecessary re-renders
  const optimizedAddToCart = useCallback(
    (productId: number, quantity: number = 1) => {
      cartContext.addToCart(productId, quantity);
    },
    [cartContext]
  );

  const optimizedRemoveFromCart = useCallback(
    (productId: number) => {
      cartContext.removeFromCart(productId);
    },
    [cartContext]
  );

  const optimizedRemoveItem = useCallback(
    (productId: number) => {
      cartContext.removeItem(productId);
    },
    [cartContext]
  );

  const optimizedClearCart = useCallback(() => {
    cartContext.clearCart();
  }, [cartContext]);

  // Memoize cart item lookup function
  const getCartItem = useCallback(
    (productId: number) => {
      return cartContext.cart.find((item) => item.productId === productId);
    },
    [cartContext.cart]
  );

  // Memoize cart quantity lookup function
  const getCartQuantity = useCallback(
    (productId: number) => {
      const item = getCartItem(productId);
      return item?.quantity || 0;
    },
    [getCartItem]
  );

  // Memoize cart total items count
  const totalItems = useMemo(() => {
    return cartContext.cart.reduce((total, item) => total + item.quantity, 0);
  }, [cartContext.cart]);

  // Memoize cart total unique items count
  const uniqueItems = useMemo(() => {
    return cartContext.cart.length;
  }, [cartContext.cart]);

  return {
    ...cartContext,
    addToCart: optimizedAddToCart,
    removeFromCart: optimizedRemoveFromCart,
    removeItem: optimizedRemoveItem,
    clearCart: optimizedClearCart,
    getCartItem,
    getCartQuantity,
    totalItems,
    uniqueItems,
  };
};
