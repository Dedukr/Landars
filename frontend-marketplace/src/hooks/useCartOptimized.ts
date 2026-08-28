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

export const useCartOptimized = () => {
  const { user } = useAuth();
  const { cart, clearCart } = useCart();
  const [products, setProducts] = useState<Product[]>(readInitialCartProducts);
  const [loading, setLoading] = useState(() => readInitialCartProducts().length === 0);
  const [isValidating, setIsValidating] = useState(false);
  const prevProductIdsRef = useRef<string | null>(null);
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const userId = user?.id ?? getPersistedUserId();

  const cartProductIdsKey = useMemo(() => {
    if (cart.length === 0) return "";
    const ids = cart.map((item) => item.productId).sort((a, b) => a - b);
    return ids.join(",");
  }, [cart]);

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

    async function fetchProductsByIds(productIdsKey: string) {
      if (!productIdsKey) {
        setProducts([]);
        setLoading(false);
        setIsValidating(false);
        return;
      }

      const hasCachedProducts = productsRef.current.length > 0;
      if (!hasCachedProducts) {
        setLoading(true);
      } else {
        setIsValidating(true);
      }

      try {
        const ids = productIdsKey.split(",").map((id) => parseInt(id, 10));
        const productPromises = ids.map(async (productId) => {
          try {
            const res = await fetch(`/api/products/${productId}/`);
            if (res.ok) {
              return (await res.json()) as Product;
            }
            console.warn(`Product ${productId} not found`);
            return null;
          } catch (error) {
            console.error(`Failed to fetch product ${productId}:`, error);
            return null;
          }
        });

        const productResults = await Promise.all(productPromises);
        const validProducts = productResults.filter(Boolean) as Product[];

        if (cancelled) return;

        setProducts(validProducts);
        if (userId) {
          writeListingProductsCache("cart", userId, validProducts);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
        if (!cancelled && productsRef.current.length === 0) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsValidating(false);
        }
      }
    }

    if (prevProductIdsRef.current !== cartProductIdsKey) {
      prevProductIdsRef.current = cartProductIdsKey;
      void fetchProductsByIds(cartProductIdsKey);
    } else if (prevProductIdsRef.current === null && cartProductIdsKey) {
      prevProductIdsRef.current = cartProductIdsKey;
      void fetchProductsByIds(cartProductIdsKey);
    }

    return () => {
      cancelled = true;
    };
  }, [cartProductIdsKey, userId]);

  useEffect(() => {
    if (products.length > 0) {
      const cartProductIds = new Set(cart.map((item) => item.productId));
      const filteredProducts = products.filter((p: Product) =>
        cartProductIds.has(p.id)
      );
      if (filteredProducts.length !== products.length) {
        setProducts(filteredProducts);
        if (userId) {
          writeListingProductsCache("cart", userId, filteredProducts);
        }
      }
    }
  }, [cart, products, userId]);

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
