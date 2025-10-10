"use client";
import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { httpClient } from "@/utils/httpClient";

interface CartResponse {
  items: Array<{
    id: number;
    product: number;
    product_name: string;
    product_price: string;
    quantity: string;
    total_price: string;
    added_date: string;
  }>;
  total_price: string;
  total_items: number;
}

interface CartItem {
  productId: number;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (productId: number, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();

  const syncLocalCartToBackend = React.useCallback(
    async (localItems: CartItem[]) => {
      if (authLoading) return; // Don't sync while auth is loading

      // Sync each item from local storage to backend
      for (const item of localItems) {
        try {
          await httpClient.post("/api/cart/", {
            productId: item.productId,
            quantity: item.quantity,
          });
        } catch (error) {
          console.error("Failed to sync cart item:", error);
        }
      }
    },
    [authLoading]
  );

  const fetchCartFromBackend = React.useCallback(
    async (skipLocalSync = false) => {
      if (authLoading) return; // Don't fetch while auth is loading

      setIsLoading(true);
      try {
        const data = await httpClient.get<CartResponse>("/api/cart/");

        // Convert backend cart format to frontend format
        const cartItems = data.items.map(
          (item: { product: number; quantity: string }) => ({
            productId: item.product,
            quantity: parseFloat(item.quantity),
          })
        );
        setCart(cartItems);

        // If there were items in localStorage, sync them to backend (only on first load)
        if (!skipLocalSync) {
          const localCart = localStorage.getItem("cart");
          if (localCart) {
            const localItems = JSON.parse(localCart);
            if (localItems.length > 0) {
              // Merge local cart with backend cart
              await syncLocalCartToBackend(localItems);
              localStorage.removeItem("cart");
              // Refresh cart after sync (skip local sync to avoid recursion)
              await fetchCartFromBackend(true);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch cart:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [syncLocalCartToBackend]
  );

  // Load cart from backend if user is authenticated, otherwise from localStorage
  useEffect(() => {
    if (user) {
      // User is authenticated, fetch cart from backend
      fetchCartFromBackend();
    } else {
      // Not authenticated, load from localStorage
      const stored = localStorage.getItem("cart");
      if (stored) {
        setCart(JSON.parse(stored));
      } else {
        // Clear cart if no stored data and user is not authenticated
        setCart([]);
      }
    }
  }, [user, fetchCartFromBackend, authLoading]);

  // Clear localStorage cart when user logs out
  useEffect(() => {
    if (!user) {
      // User logged out, clear localStorage cart and reset local state
      localStorage.removeItem("cart");
      setCart([]);
    }
  }, [user]);

  // Listen for logout events
  useEffect(() => {
    const handleLogout = () => {
      setCart([]);
      localStorage.removeItem("cart");
    };

    window.addEventListener("user:logout", handleLogout);
    return () => window.removeEventListener("user:logout", handleLogout);
  }, []);

  // Save cart to localStorage only if user is not authenticated
  useEffect(() => {
    if (!user) {
      localStorage.setItem("cart", JSON.stringify(cart));
    }
  }, [cart, user]);

  const addToCart = async (productId: number, quantity: number = 1) => {
    if (user) {
      // Add to backend cart
      setIsLoading(true);
      try {
        await httpClient.post("/api/cart/", {
          productId: productId,
          quantity: quantity,
        });

        // Update local state
        setCart((prev: CartItem[]) => {
          const existing = prev.find(
            (item: CartItem) => item.productId === productId
          );
          if (existing) {
            return prev.map((item: CartItem) =>
              item.productId === productId
                ? { ...item, quantity: item.quantity + quantity }
                : item
            );
          } else {
            return [...prev, { productId, quantity }];
          }
        });
      } catch (error) {
        console.error("Failed to add to cart:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Add to local cart
      setCart((prev: CartItem[]) => {
        const existing = prev.find(
          (item: CartItem) => item.productId === productId
        );
        if (existing) {
          return prev.map((item: CartItem) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity + quantity }
              : item
          );
        } else {
          return [...prev, { productId, quantity }];
        }
      });
    }
  };

  const removeFromCart = async (productId: number) => {
    if (user) {
      // Remove from backend cart
      setIsLoading(true);
      try {
        const existing = cart.find((item) => item.productId === productId);
        if (!existing) return;

        const newQuantity = existing.quantity - 1;

        if (newQuantity <= 0) {
          // Delete the item
          await httpClient.request("/api/cart/", {
            method: "DELETE",
            body: JSON.stringify({ productId: productId }),
          });

          setCart((prev: CartItem[]) =>
            prev.filter((item: CartItem) => item.productId !== productId)
          );
        } else {
          // Update quantity
          await httpClient.patch("/api/cart/", {
            productId: productId,
            quantity: newQuantity,
          });

          setCart((prev: CartItem[]) =>
            prev.map((item: CartItem) =>
              item.productId === productId
                ? { ...item, quantity: newQuantity }
                : item
            )
          );
        }
      } catch (error) {
        console.error("Failed to remove from cart:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Remove from local cart
      setCart((prev: CartItem[]) => {
        const existing = prev.find(
          (item: CartItem) => item.productId === productId
        );
        if (!existing) return prev;
        if (existing.quantity <= 1) {
          return prev.filter((item: CartItem) => item.productId !== productId);
        } else {
          return prev.map((item: CartItem) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          );
        }
      });
    }
  };

  const removeItem = async (productId: number) => {
    if (user) {
      // Remove entire item from backend cart
      setIsLoading(true);
      try {
        await httpClient.patch("/api/cart/", {
          productId: productId,
          quantity: 0,
        });
        setCart((prev: CartItem[]) =>
          prev.filter((item: CartItem) => item.productId !== productId)
        );
      } catch (error) {
        console.error("Failed to remove item from cart:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Remove entire item from local cart
      setCart((prev: CartItem[]) =>
        prev.filter((item: CartItem) => item.productId !== productId)
      );
    }
  };

  const clearCart = async () => {
    if (user) {
      // Clear backend cart
      setIsLoading(true);
      try {
        await httpClient.delete("/api/cart/");
        setCart([]);
      } catch (error) {
        console.error("Failed to clear cart:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Clear local cart
      setCart([]);
    }
  };

  return React.createElement(
    CartContext.Provider,
    {
      value: {
        cart,
        addToCart,
        removeFromCart,
        removeItem,
        clearCart,
        isLoading,
      },
    },
    children
  );
};

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
