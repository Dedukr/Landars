"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
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

  // Initial products fetch - only run once on mount
  useEffect(() => {
    async function fetchInitialProducts() {
      if (cart.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch products individually since we don't have a bulk endpoint
        const productPromises = cart.map(async (item) => {
          try {
            const res = await fetch(`/api/products/${item.productId}/`);
            if (res.ok) {
              return await res.json();
            }
            console.warn(`Product ${item.productId} not found`);
            return null;
          } catch (error) {
            console.error(`Failed to fetch product ${item.productId}:`, error);
            return null;
          }
        });

        const productResults = await Promise.all(productPromises);
        const validProducts = productResults.filter(Boolean);
        setProducts(validProducts);
      } catch (error) {
        console.error("Error fetching products:", error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchInitialProducts();
  }, [cart]); // Include dependencies

  // Handle cart changes to sync products with context
  useEffect(() => {
    if (products.length > 0) {
      // Filter products based on current cart
      const cartProductIds = cart.map((item) => item.productId);
      const filteredProducts = products.filter((p: Product) =>
        cartProductIds.includes(p.id)
      );

      // Only update if the filtered list is different
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
