"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useWishlist } from "@/contexts/WishlistContext";
import { httpClient } from "@/utils/httpClient";

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

interface WishlistStatsData {
  totalItems: number;
  totalValue: number;
  averagePrice: number;
  categories: string[];
}

export const useWishlistOptimized = () => {
  const { wishlist, clearWishlist } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<WishlistStatsData | null>(null);
  const [recommendations, setRecommendations] = useState<Product[]>([]);

  // Memoized stats calculation
  const calculateStats = useCallback((products: Product[]) => {
    const totalValue = products.reduce(
      (sum, product) => sum + parseFloat(product.price),
      0
    );
    const categories = [
      ...new Set(products.flatMap((p) => p.categories || [])),
    ];

    const newStats = {
      totalItems: products.length,
      totalValue,
      averagePrice: products.length > 0 ? totalValue / products.length : 0,
      categories,
    };

    setStats(newStats);
    return newStats;
  }, []);

  // Memoized recommendations fetch
  const fetchRecommendations = useCallback(
    async (wishlistProducts: Product[]) => {
      try {
        // Get categories from wishlist items
        const categories = [
          ...new Set(wishlistProducts.flatMap((p) => p.categories || [])),
        ];

        if (categories.length > 0) {
          // Build query parameters with exclude and categories
          const params = new URLSearchParams();
          params.append("categories", categories.join(","));
          params.append("exclude", wishlist.join(","));
          params.append("limit", "6");

          const allProducts = await httpClient.getProducts<Product>(
            `/api/products/?${params.toString()}`
          );

          setRecommendations(allProducts.slice(0, 6));
        }
      } catch (error) {
        console.error("Error fetching recommendations:", error);
      }
    },
    [wishlist]
  );

  // Initial products fetch - only run once on mount
  useEffect(() => {
    async function fetchInitialProducts() {
      if (wishlist.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch all products using httpClient
        const allProducts = await httpClient.getProducts<Product>(
          "/api/products/"
        );

        // Filter to only products in wishlist
        const wishlistProducts = allProducts.filter((p: Product) =>
          wishlist.includes(p.id)
        );
        setProducts(wishlistProducts);

        // Calculate stats
        calculateStats(wishlistProducts);

        // Fetch recommendations
        fetchRecommendations(wishlistProducts);
      } catch (error) {
        console.error("Error fetching products:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchInitialProducts();
  }, [wishlist, calculateStats, fetchRecommendations]); // Include dependencies

  // Handle wishlist changes to sync products with context
  useEffect(() => {
    if (products.length > 0) {
      // Filter products based on current wishlist
      const filteredProducts = products.filter((p: Product) =>
        wishlist.includes(p.id)
      );

      // Only update if the filtered list is different
      if (filteredProducts.length !== products.length) {
        setProducts(filteredProducts);
        calculateStats(filteredProducts);
        fetchRecommendations(filteredProducts);
      }
    }
  }, [wishlist, products, calculateStats, fetchRecommendations]);

  // Memoized filtered and sorted products
  const filteredAndSortedProducts = useMemo(() => {
    return products;
  }, [products]);

  return {
    products: filteredAndSortedProducts,
    loading,
    stats,
    recommendations,
    clearWishlist,
    wishlist,
  };
};
