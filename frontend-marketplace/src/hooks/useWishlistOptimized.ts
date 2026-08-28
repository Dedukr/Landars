"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import type { WishlistProduct, WishlistStatsData } from "@/lib/wishlistTypes";
import {
  readListingProductsCache,
  writeListingProductsCache,
} from "@/utils/listingProductCache";
import { getPersistedUserId } from "@/utils/persistedUser";

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

function readInitialWishlistProducts(): WishlistProduct[] {
  const userId = getPersistedUserId();
  if (!userId) return [];
  return readListingProductsCache("wishlist", userId) ?? [];
}

function buildStats(rows: WishlistProduct[]): WishlistStatsData {
  const totalValue = sumValidPrices(rows);
  const categories = [...new Set(rows.flatMap((p) => p.categories || []))];
  return {
    totalItems: rows.length,
    totalValue,
    categories,
  };
}

export const useWishlistOptimized = () => {
  const { user } = useAuth();
  const { wishlist, clearWishlist } = useWishlist();
  const initialProducts = readInitialWishlistProducts();
  const [products, setProducts] = useState<WishlistProduct[]>(initialProducts);
  const [loading, setLoading] = useState(
    () => initialProducts.length === 0
  );
  const [isValidating, setIsValidating] = useState(false);
  const [stats, setStats] = useState<WishlistStatsData | null>(() =>
    initialProducts.length > 0 ? buildStats(initialProducts) : null
  );
  const [reloadNonce, setReloadNonce] = useState(0);

  const userId = user?.id ?? getPersistedUserId();
  const prevWishlistIdsRef = useRef<string>("");
  const productsRef = useRef<WishlistProduct[]>(products);
  productsRef.current = products;

  const retryProductsFetch = useCallback(() => {
    prevWishlistIdsRef.current = "";
    setReloadNonce((n) => n + 1);
  }, []);

  const calculateStats = useCallback((rows: WishlistProduct[]) => {
    const newStats = buildStats(rows);
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
          setIsValidating(false);
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
            if (userId) {
              writeListingProductsCache("wishlist", userId, filteredProducts);
            }
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
          if (userId) {
            writeListingProductsCache("wishlist", userId, filteredProducts);
          }
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

      const hasCachedProducts = productsRef.current.length > 0;
      if (!hasCachedProducts) {
        setLoading(true);
      } else {
        setIsValidating(true);
      }

      try {
        if (addedIds.length > 0) {
          const newProducts = await runFetch(addedIds);
          const snapshot = productsRef.current;
          const updatedProducts = mergeUniqueWishlistProducts(
            snapshot,
            newProducts,
            wishlist
          );

          if (!cancelled) {
            setProducts(updatedProducts);
            calculateStats(updatedProducts);
            if (userId) {
              writeListingProductsCache("wishlist", userId, updatedProducts);
            }
          }
        } else if (productsRef.current.length === 0 && wishlist.length > 0) {
          const fetchedProducts = await runFetch(wishlist);
          if (!cancelled) {
            setProducts(fetchedProducts);
            calculateStats(fetchedProducts);
            if (userId) {
              writeListingProductsCache("wishlist", userId, fetchedProducts);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsValidating(false);
        }
      }

      if (!cancelled) {
        prevWishlistIdsRef.current = wishlistIdsKey;
      }
    }

    void fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [wishlistIdsKey, wishlist, calculateStats, reloadNonce, userId]);

  return {
    products,
    loading,
    isValidating,
    stats,
    clearWishlist,
    wishlist,
    productsLoadError,
    retryProductsFetch,
  };
};
