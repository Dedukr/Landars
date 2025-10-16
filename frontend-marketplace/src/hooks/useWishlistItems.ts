"use client";
import { useState, useCallback, useMemo } from "react";
import { useWishlist } from "@/contexts/WishlistContext";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  categories?: string[];
  image_url?: string | null;
  original_price?: string;
  discount_percentage?: number;
  in_stock?: boolean;
  stock_quantity?: number;
}

export const useWishlistItems = (products: Product[]) => {
  const { removeFromWishlist, wishlist } = useWishlist();
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());

  // Optimized remove function that only updates the specific item
  const removeItem = useCallback(
    (productId: number) => {
      // Add to removing set for animation
      setRemovingIds((prev) => new Set(prev).add(productId));

      // Remove from wishlist context
      removeFromWishlist(productId);

      // Clean up removing state after animation
      setTimeout(() => {
        setRemovingIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
      }, 300);
    },
    [removeFromWishlist]
  );

  // Memoized filtered products - filter out items that are being removed OR not in wishlist
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
