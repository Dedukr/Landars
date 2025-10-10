"use client";
import { useCallback } from "react";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";

/**
 * Create a debounced version of a function
 */
const createDebouncedFunction = <T extends (...args: never[]) => void>(
  func: T,
  delay: number
): T => {
  let timeoutId: NodeJS.Timeout | null = null;

  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  }) as T;
};

/**
 * Hook for debouncing cart operations to prevent excessive API calls
 */
export const useDebouncedCartOperations = () => {
  const { addToCart, removeFromCart } = useCart();

  const debouncedAddToCart = useCallback(
    (...args: Parameters<typeof addToCart>) => {
      const debouncedFn = createDebouncedFunction(addToCart, 300);
      return debouncedFn(...args);
    },
    [addToCart]
  );

  const debouncedRemoveFromCart = useCallback(
    (...args: Parameters<typeof removeFromCart>) => {
      const debouncedFn = createDebouncedFunction(removeFromCart, 300);
      return debouncedFn(...args);
    },
    [removeFromCart]
  );

  return {
    addToCart: debouncedAddToCart,
    removeFromCart: debouncedRemoveFromCart,
  };
};

/**
 * Hook for debouncing wishlist operations to prevent excessive API calls
 */
export const useDebouncedWishlistOperations = () => {
  const { addToWishlist, removeFromWishlist } = useWishlist();

  const debouncedAddToWishlist = useCallback(
    (...args: Parameters<typeof addToWishlist>) => {
      const debouncedFn = createDebouncedFunction(addToWishlist, 300);
      return debouncedFn(...args);
    },
    [addToWishlist]
  );

  const debouncedRemoveFromWishlist = useCallback(
    (...args: Parameters<typeof removeFromWishlist>) => {
      const debouncedFn = createDebouncedFunction(removeFromWishlist, 300);
      return debouncedFn(...args);
    },
    [removeFromWishlist]
  );

  return {
    addToWishlist: debouncedAddToWishlist,
    removeFromWishlist: debouncedRemoveFromWishlist,
  };
};
