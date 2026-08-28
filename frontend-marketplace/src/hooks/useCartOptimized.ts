"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import {
  readListingProductsCache,
  writeListingProductsCache,
  type CachedListingProduct,
} from "@/utils/listingProductCache";
import { getPersistedUserId } from "@/utils/persistedUser";

type Product = CachedListingProduct;

function readInitialCartProducts(): Product[] {
  const userId = getPersistedUserId();
  if (!userId) return [];
  return readListingProductsCache("cart", userId) ?? [];
}

function mergeUniqueCartProducts(
  existing: Product[],
  incoming: Product[],
  ids: readonly number[]
): Product[] {
  const merged = [...existing.filter((p) => ids.includes(p.id)), ...incoming];
  const byId = new Map<number, Product>();
  for (const row of merged) {
    byId.set(row.id, row);
  }
  return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
}

export const useCartOptimized = () => {
  const { user } = useAuth();
  const { cart, clearCart } = useCart();
  const [products, setProducts] = useState<Product[]>(readInitialCartProducts);
  const [loading, setLoading] = useState(() => readInitialCartProducts().length === 0);
  const [isValidating, setIsValidating] = useState(false);
  const prevProductIdsRef = useRef<string>("");
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const userId = user?.id ?? getPersistedUserId();

  const cartProductIdsKey = useMemo(() => {
    if (cart.length === 0) return "";
    const ids = cart.map((item) => item.productId).sort((a, b) => a - b);
    return ids.join(",");
  }, [cart]);

  const cartProductIds = useMemo(
    () => cart.map((item) => item.productId),
    [cart]
  );

  const calculateStats = useCallback(
    (productRows: Product[]) => {
      const subtotal = productRows.reduce((sum, product) => {
        const cartItem = cart.find((item) => item.productId === product.id);
        return sum + parseFloat(product.price) * (cartItem?.quantity || 0);
      }, 0);

      const shipping = subtotal > 50 ? 0 : 4.99;
      const tax = subtotal * 0.2;
      const total = subtotal + shipping + tax;

      return {
        totalItems: cart.reduce((sum, item) => sum + item.quantity, 0),
        subtotal,
        shipping,
        tax,
        total,
      };
    },
    [cart]
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      if (cartProductIdsKey === "") {
        if (!cancelled) {
          setProducts([]);
          setLoading(false);
          setIsValidating(false);
        }
        prevProductIdsRef.current = "";
        return;
      }

      if (prevProductIdsRef.current === cartProductIdsKey) {
        const current = productsRef.current;
        const filteredProducts = current.filter((p) =>
          cartProductIds.includes(p.id)
        );
        if (filteredProducts.length !== current.length) {
          if (!cancelled) {
            setProducts(filteredProducts);
            if (userId) {
              writeListingProductsCache("cart", userId, filteredProducts);
            }
          }
        }
        return;
      }

      const prevIds = prevProductIdsRef.current
        ? prevProductIdsRef.current.split(",").map(Number)
        : [];
      const currentIds = cartProductIds;
      const addedIds = currentIds.filter((id) => !prevIds.includes(id));
      const removedIds = prevIds.filter((id) => !currentIds.includes(id));

      if (addedIds.length === 0 && removedIds.length > 0) {
        const current = productsRef.current;
        const filteredProducts = current.filter((p) =>
          cartProductIds.includes(p.id)
        );
        if (!cancelled) {
          setProducts(filteredProducts);
          if (userId) {
            writeListingProductsCache("cart", userId, filteredProducts);
          }
          prevProductIdsRef.current = cartProductIdsKey;
        }
        return;
      }

      const runFetch = async (ids: number[]) => {
        const productPromises = ids.map(async (productId) => {
          try {
            const res = await fetch(`/api/products/${productId}/`);
            if (!res.ok) return null;
            return (await res.json()) as Product | null;
          } catch (error) {
            console.error(`Failed to fetch product ${productId}:`, error);
            return null;
          }
        });

        return (await Promise.all(productPromises)).filter(Boolean) as Product[];
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
          const updatedProducts = mergeUniqueCartProducts(
            snapshot,
            newProducts,
            cartProductIds
          );

          if (!cancelled) {
            setProducts(updatedProducts);
            if (userId) {
              writeListingProductsCache("cart", userId, updatedProducts);
            }
          }
        } else if (productsRef.current.length === 0 && cartProductIds.length > 0) {
          const fetchedProducts = await runFetch(cartProductIds);
          if (!cancelled) {
            setProducts(fetchedProducts);
            if (userId) {
              writeListingProductsCache("cart", userId, fetchedProducts);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching cart products:", error);
        if (!cancelled && productsRef.current.length === 0) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsValidating(false);
        }
      }

      if (!cancelled) {
        prevProductIdsRef.current = cartProductIdsKey;
      }
    }

    void fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [cartProductIdsKey, cartProductIds, userId]);

  const stats = useMemo(() => calculateStats(products), [products, calculateStats]);

  return {
    products,
    loading,
    isValidating,
    stats,
    clearCart,
    cart,
  };
};
