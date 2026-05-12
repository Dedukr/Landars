"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWishlist } from "@/contexts/WishlistContext";
import type { WishlistProduct, WishlistStatsData } from "@/lib/wishlistTypes";

function sumValidPrices(rows: WishlistProduct[]): number {
  return rows.reduce((sum, product) => {
    const raw = parseFloat(String(product.price));
    return Number.isFinite(raw) ? sum + raw : sum;
  }, 0);
}

function mergeUniqueWishlistProducts(
  existing: WishlistProduct[],
  incoming: WishlistProduct[],
  ids: readonly number[]
): WishlistProduct[] {
  const merged = [...existing.filter((p) => ids.includes(p.id)), ...incoming];
  const byId = new Map<number, WishlistProduct>();
  for (const row of merged) {
    byId.set(row.id, row);
  }
  return ids.map((id) => byId.get(id)).filter((p): p is WishlistProduct => Boolean(p));
}

export const useWishlistOptimized = () => {
  const { wishlist, clearWishlist } = useWishlist();
  const [products, setProducts] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<WishlistStatsData | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const prevWishlistIdsRef = useRef<string>("");
  const productsRef = useRef<WishlistProduct[]>(products);
  productsRef.current = products;

  const retryProductsFetch = useCallback(() => {
    prevWishlistIdsRef.current = "";
    setReloadNonce((n) => n + 1);
  }, []);

  const calculateStats = useCallback((rows: WishlistProduct[]) => {
    const totalValue = sumValidPrices(rows);
    const categories = [...new Set(rows.flatMap((p) => p.categories || []))];
    const newStats: WishlistStatsData = {
      totalItems: rows.length,
      totalValue,
      categories,
    };
    setStats(newStats);
    return newStats;
  }, []);

  const wishlistIdsKey = useMemo(() => {
    return [...wishlist].sort((a, b) => a - b).join(",");
  }, [wishlist]);

  const productsLoadError = useMemo(
    () => wishlist.length > 0 && !loading && products.length === 0,
    [wishlist.length, loading, products.length]
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      if (wishlist.length === 0) {
        if (!cancelled) {
          setProducts([]);
          setStats(null);
          setLoading(false);
        }
        prevWishlistIdsRef.current = "";
        return;
      }

      if (prevWishlistIdsRef.current === wishlistIdsKey) {
        const current = productsRef.current;
        const filteredProducts = current.filter((p) => wishlist.includes(p.id));
        if (filteredProducts.length !== current.length) {
          if (!cancelled) {
            setProducts(filteredProducts);
            calculateStats(filteredProducts);
          }
        }
        return;
      }

      const prevIds = prevWishlistIdsRef.current
        ? prevWishlistIdsRef.current.split(",").map(Number)
        : [];
      const currentIds = wishlist;
      const addedIds = currentIds.filter((id) => !prevIds.includes(id));
      const removedIds = prevIds.filter((id) => !currentIds.includes(id));

      if (addedIds.length === 0 && removedIds.length > 0) {
        const current = productsRef.current;
        const filteredProducts = current.filter((p) => wishlist.includes(p.id));
        if (!cancelled) {
          setProducts(filteredProducts);
          calculateStats(filteredProducts);
          prevWishlistIdsRef.current = wishlistIdsKey;
        }
        return;
      }

      const runFetch = async (ids: number[]) => {
        const productPromises = ids.map(async (productId) => {
          try {
            const res = await fetch(`/api/products/${productId}/`);
            if (!res.ok) return null;
            return (await res.json()) as WishlistProduct | null;
          } catch (error) {
            console.error(`Failed to fetch product ${productId}:`, error);
            return null;
          }
        });

        return (await Promise.all(productPromises)).filter(Boolean) as WishlistProduct[];
      };

      try {
        if (addedIds.length > 0) {
          if (productsRef.current.length === 0) setLoading(true);

          const newProducts = await runFetch(addedIds);
          const snapshot = productsRef.current;
          const updatedProducts = mergeUniqueWishlistProducts(snapshot, newProducts, wishlist);

          if (!cancelled) {
            setProducts(updatedProducts);
            calculateStats(updatedProducts);
          }
        } else if (productsRef.current.length === 0 && wishlist.length > 0) {
          setLoading(true);
          const fetchedProducts = await runFetch(wishlist);
          if (!cancelled) {
            setProducts(fetchedProducts);
            calculateStats(fetchedProducts);
          }
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (!cancelled) {
        prevWishlistIdsRef.current = wishlistIdsKey;
      }
    }

    void fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [wishlistIdsKey, wishlist, calculateStats, reloadNonce]);

  return {
    products,
    loading,
    stats,
    clearWishlist,
    wishlist,
    productsLoadError,
    retryProductsFetch,
  };
};
