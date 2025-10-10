"use client";
import { useCallback, useMemo } from "react";
import { useWishlist } from "@/contexts/WishlistContext";

/**
 * Optimized wishlist hook that provides memoized wishlist operations
 * to prevent unnecessary re-renders in components
 */
export const useOptimizedWishlist = () => {
  const wishlistContext = useWishlist();

  // Memoize wishlist operations to prevent unnecessary re-renders
  const optimizedAddToWishlist = useCallback(
    (productId: number) => {
      wishlistContext.addToWishlist(productId);
    },
    [wishlistContext]
  );

  const optimizedRemoveFromWishlist = useCallback(
    (productId: number) => {
      wishlistContext.removeFromWishlist(productId);
    },
    [wishlistContext]
  );

  const optimizedClearWishlist = useCallback(() => {
    wishlistContext.clearWishlist();
  }, [wishlistContext]);

  // Memoize wishlist status check function
  const optimizedIsInWishlist = useCallback(
    (productId: number) => {
      return wishlistContext.isInWishlist(productId);
    },
    [wishlistContext]
  );

  // Memoize wishlist toggle function
  const toggleWishlist = useCallback(
    (productId: number) => {
      if (wishlistContext.isInWishlist(productId)) {
        wishlistContext.removeFromWishlist(productId);
      } else {
        wishlistContext.addToWishlist(productId);
      }
    },
    [wishlistContext]
  );

  // Memoize wishlist count
  const wishlistCount = useMemo(() => {
    return wishlistContext.wishlist.length;
  }, [wishlistContext.wishlist]);

  return {
    ...wishlistContext,
    addToWishlist: optimizedAddToWishlist,
    removeFromWishlist: optimizedRemoveFromWishlist,
    clearWishlist: optimizedClearWishlist,
    isInWishlist: optimizedIsInWishlist,
    toggleWishlist,
    wishlistCount,
  };
};
