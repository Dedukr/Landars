"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCart } from "@/contexts/CartContext";

interface Product {
  id: number;
  name: string;
  price: string;
  image_url?: string | null;
  description?: string;
  categories?: string[];
}

export const useCartOptimized = () => {
  const { cart, clearCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const prevProductIdsRef = useRef<string | null>(null);

  // Stable, sorted product id set string to detect only ID changes (not quantities)
  const cartProductIdsKey = useMemo(() => {
    if (cart.length === 0) return "";
    const ids = cart.map((item) => item.productId).sort((a, b) => a - b);
    return ids.join(",");
  }, [cart]);

  // Memoized stats calculation
  const calculateStats = useCallback(
    (products: Product[]) => {
      const subtotal = products.reduce((sum, product) => {
        const cartItem = cart.find((item) => item.productId === product.id);
        return sum + parseFloat(product.price) * (cartItem?.quantity || 0);
      }, 0);

      const shipping = subtotal > 50 ? 0 : 4.99; // Free shipping over £50
      const tax = subtotal * 0.2; // 20% VAT
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

  // Fetch products only when the SET of product IDs changes (not quantities)
  useEffect(() => {
    async function fetchProductsByIds(productIdsKey: string) {
      if (!productIdsKey) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const ids = productIdsKey.split(",").map((id) => parseInt(id, 10));
        const productPromises = ids.map(async (productId) => {
          try {
            const res = await fetch(`/api/products/${productId}/`);
            if (res.ok) {
              return await res.json();
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
        setProducts(validProducts);
      } catch (error) {
        console.error("Error fetching products:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    // Only fetch when product IDs actually change (not when quantities change)
    // Don't set loading state based on cartIsLoading to avoid page reload effect
    if (prevProductIdsRef.current !== cartProductIdsKey) {
      prevProductIdsRef.current = cartProductIdsKey;
      fetchProductsByIds(cartProductIdsKey);
    } else if (prevProductIdsRef.current === null && cartProductIdsKey) {
      // Initial load - fetch products
      fetchProductsByIds(cartProductIdsKey);
    }
  }, [cartProductIdsKey]);

  // Keep products array aligned with current cart IDs (no loading toggles)
  useEffect(() => {
    if (products.length > 0) {
      const cartProductIds = new Set(cart.map((item) => item.productId));
      const filteredProducts = products.filter((p: Product) =>
        cartProductIds.has(p.id)
      );
      if (filteredProducts.length !== products.length) {
        setProducts(filteredProducts);
      }
    }
  }, [cart, products]);

  // Memoized stats
  const stats = useMemo(() => {
    return calculateStats(products);
  }, [products, calculateStats]);

  return {
    products,
    loading,
    stats,
    clearCart,
    cart,
  };
};
