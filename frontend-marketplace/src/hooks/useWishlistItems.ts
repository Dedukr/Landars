"use client";
import { useState, useCallback, useMemo } from "react";
import { useWishlist } from "@/contexts/WishlistContext";

export const useWishlistItems = <T extends { id: number }>(products: T[]) => {
  const { removeFromWishlist, wishlist } = useWishlist();
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());

  const removeItem = useCallback((productId: number) => {
    setRemovingIds((prev) => new Set(prev).add(productId));
    removeFromWishlist(productId);
    window.setTimeout(() => {
      setRemovingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }, 300);
  }, [removeFromWishlist]);

  const filteredProducts = useMemo(() => {
    return products.filter(
      (product) => !removingIds.has(product.id) && wishlist.includes(product.id)
    );
  }, [products, removingIds, wishlist]);

  return {
    filteredProducts,
    removingIds,
    removeItem,
  };
};
