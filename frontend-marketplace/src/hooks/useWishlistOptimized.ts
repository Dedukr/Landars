"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  const prevWishlistIdsRef = useRef<string>("");
  /** Mirrors `products` for use inside async/sync effect without listing `products` in deps (avoids effect thrash). */
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

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

  // Create stable key from wishlist IDs (sorted)
  const wishlistIdsKey = useMemo(() => {
    return [...wishlist].sort((a, b) => a - b).join(",");
  }, [wishlist]);

  // Fetch products only when wishlist IDs change — do not depend on `products`
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      if (wishlist.length === 0) {
        setProducts([]);
        setLoading(false);
        prevWishlistIdsRef.current = "";
        return;
      }

      // Only fetch if the set of IDs has changed
      if (prevWishlistIdsRef.current === wishlistIdsKey) {
        // IDs haven't changed, just ensure products are filtered correctly
        const current = productsRef.current;
        const filteredProducts = current.filter((p: Product) =>
          wishlist.includes(p.id)
        );
        if (filteredProducts.length !== current.length) {
          if (!cancelled) {
            setProducts(filteredProducts);
            calculateStats(filteredProducts);
          }
        }
        return;
      }

      // IDs have changed - determine if we're adding or removing
      const prevIds = prevWishlistIdsRef.current
        ? prevWishlistIdsRef.current.split(",").map(Number)
        : [];
      const currentIds = wishlist;
      const addedIds = currentIds.filter((id) => !prevIds.includes(id));
      const removedIds = prevIds.filter((id) => !currentIds.includes(id));

      // If only removing, just filter existing products (no loading state)
      if (addedIds.length === 0 && removedIds.length > 0) {
        const current = productsRef.current;
        const filteredProducts = current.filter((p: Product) =>
          wishlist.includes(p.id)
        );
        if (!cancelled) {
          setProducts(filteredProducts);
          calculateStats(filteredProducts);
          prevWishlistIdsRef.current = wishlistIdsKey;
        }
        return;
      }

      // If adding new products, fetch them
      if (addedIds.length > 0) {
        try {
          // Only set loading on initial fetch
          if (productsRef.current.length === 0) {
            setLoading(true);
          }

          // Fetch only the new products
          const productPromises = addedIds.map(async (productId) => {
            try {
              const res = await fetch(`/api/products/${productId}/`);
              if (res.ok) {
                return await res.json();
              }
              return null;
            } catch (error) {
              console.error(`Failed to fetch product ${productId}:`, error);
              return null;
            }
          });

          const newProducts = (await Promise.all(productPromises)).filter(
            Boolean
          ) as Product[];

          // Combine with existing products and filter to current wishlist
          const snapshot = productsRef.current;
          const updatedProducts = [
            ...snapshot.filter((p) => wishlist.includes(p.id)),
            ...newProducts,
          ];

          if (!cancelled) {
            setProducts(updatedProducts);
            calculateStats(updatedProducts);
          }
        } catch (error) {
          console.error("Error fetching products:", error);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      } else if (productsRef.current.length === 0 && wishlist.length > 0) {
        // Initial load - fetch all products
        try {
          setLoading(true);
          const productPromises = wishlist.map(async (productId) => {
            try {
              const res = await fetch(`/api/products/${productId}/`);
              if (res.ok) {
                return await res.json();
              }
              return null;
            } catch (error) {
              console.error(`Failed to fetch product ${productId}:`, error);
              return null;
            }
          });

          const fetchedProducts = (await Promise.all(productPromises)).filter(
            Boolean
          ) as Product[];

          if (!cancelled) {
            setProducts(fetchedProducts);
            calculateStats(fetchedProducts);
          }
        } catch (error) {
          console.error("Error fetching products:", error);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }

      if (!cancelled) {
        prevWishlistIdsRef.current = wishlistIdsKey;
      }
    }
    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [wishlistIdsKey, wishlist, calculateStats]);

  // Memoized filtered and sorted products
  const filteredAndSortedProducts = useMemo(() => {
    return products;
  }, [products]);

  return {
    products: filteredAndSortedProducts,
    loading,
    stats,
    clearWishlist,
    wishlist,
  };
};
