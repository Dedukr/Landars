"use client";

import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { httpClient } from "@/utils/httpClient";
import { clearCartStorage } from "@/utils/cartStorage";

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

export interface CartItem {
  productId: number;
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (productId: number, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  isLoading: boolean;
  /** Always empty — guest cart merge removed; kept for CartMergeNotification compat. */
  mergeConflicts: never[];
  lastMergeSummary: null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user, token, loading: authLoading } = useAuth();
  const prevUserRef = useRef<typeof user | undefined>(undefined);

  const resetCartState = useCallback(() => {
    setCart([]);
    clearCartStorage();
  }, []);

  const loadCartFromBackend = useCallback(async () => {
    if (!user || !token || authLoading) return;

    await new Promise((resolve) => setTimeout(resolve, 100));

    setIsLoading(true);
    try {
      const data = await httpClient.get<CartResponse>("/api/cart/");
      setCart(
        data.items.map((item) => ({
          productId: item.product,
          quantity: parseFloat(item.quantity),
        }))
      );
    } catch (error) {
      console.error("Failed to fetch cart:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, token, authLoading]);

  useEffect(() => {
    if (user && token) {
      if (!authLoading) {
        void loadCartFromBackend();
      }
      return;
    }

    const wasAuthenticated =
      prevUserRef.current !== undefined && prevUserRef.current !== null;
    if (wasAuthenticated) {
      resetCartState();
    } else {
      setCart([]);
      clearCartStorage();
    }
  }, [user, token, authLoading, loadCartFromBackend, resetCartState]);

  useLayoutEffect(() => {
    const prev = prevUserRef.current;
    if (prev !== undefined && prev !== null && user === null) {
      resetCartState();
    }
    prevUserRef.current = user;
  }, [user, resetCartState]);

  useEffect(() => {
    const onLogout = () => resetCartState();
    window.addEventListener("user:logout", onLogout);
    window.addEventListener("auth:logout", onLogout);
    return () => {
      window.removeEventListener("user:logout", onLogout);
      window.removeEventListener("auth:logout", onLogout);
    };
  }, [resetCartState]);

  const addToCart = useCallback(
    async (productId: number, quantity: number = 1) => {
      if (!user || !token) return;

      setIsLoading(true);
      try {
        await httpClient.post("/api/cart/", {
          productId,
          quantity,
        });

        setCart((prev) => {
          const existing = prev.find((item) => item.productId === productId);
          if (existing) {
            return prev.map((item) =>
              item.productId === productId
                ? { ...item, quantity: item.quantity + quantity }
                : item
            );
          }
          return [...prev, { productId, quantity }];
        });
      } catch (error) {
        console.error("Failed to add to cart:", error);
        await loadCartFromBackend();
      } finally {
        setIsLoading(false);
      }
    },
    [user, token, loadCartFromBackend]
  );

  const removeFromCart = useCallback(
    async (productId: number) => {
      if (!user || !token) return;

      const existing = cart.find((item) => item.productId === productId);
      if (!existing) return;

      const newQuantity = existing.quantity - 1;
      setIsLoading(true);
      try {
        if (newQuantity <= 0) {
          setCart((prev) =>
            prev.filter((item) => item.productId !== productId)
          );
          await httpClient.request("/api/cart/", {
            method: "DELETE",
            body: JSON.stringify({ productId }),
          });
        } else {
          setCart((prev) =>
            prev.map((item) =>
              item.productId === productId
                ? { ...item, quantity: newQuantity }
                : item
            )
          );
          await httpClient.patch("/api/cart/", {
            productId,
            quantity: newQuantity,
          });
        }
      } catch (error) {
        console.error("Failed to remove from cart:", error);
        await loadCartFromBackend();
      } finally {
        setIsLoading(false);
      }
    },
    [user, token, cart, loadCartFromBackend]
  );

  const updateQuantity = useCallback(
    async (productId: number, quantity: number) => {
      if (!user || !token) return;

      const previousCart = [...cart];
      try {
        setCart((prev) => {
          if (quantity <= 0) {
            return prev.filter((item) => item.productId !== productId);
          }
          const existing = prev.find((item) => item.productId === productId);
          if (existing) {
            return prev.map((item) =>
              item.productId === productId ? { ...item, quantity } : item
            );
          }
          return [...prev, { productId, quantity }];
        });

        if (quantity <= 0) {
          await httpClient.request("/api/cart/", {
            method: "DELETE",
            body: JSON.stringify({ productId }),
          });
        } else {
          await httpClient.post("/api/cart/", {
            productId,
            quantity,
            replace: true,
          });
        }
      } catch (error) {
        console.error("Failed to update quantity:", error);
        setCart(previousCart);
      }
    },
    [user, token, cart]
  );

  const removeItem = useCallback(
    async (productId: number) => {
      if (!user || !token) return;

      setIsLoading(true);
      const previousCart = [...cart];
      try {
        setCart((prev) => prev.filter((item) => item.productId !== productId));
        await httpClient.patch("/api/cart/", {
          productId,
          quantity: 0,
        });
      } catch (error) {
        console.error("Failed to remove item from cart:", error);
        setCart(previousCart);
      } finally {
        setIsLoading(false);
      }
    },
    [user, token, cart]
  );

  const clearCart = useCallback(async () => {
    if (!user || !token) {
      resetCartState();
      return;
    }

    setIsLoading(true);
    const previousCart = [...cart];
    try {
      setCart([]);
      await httpClient.delete("/api/cart/");
    } catch (error) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status;

      if (status === 404) {
        console.warn("Cart already deleted on backend.");
      } else {
        console.error("Failed to clear cart:", error);
        setCart(previousCart);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, token, cart, resetCartState]);

  const contextValue = useMemo(
    () => ({
      cart,
      addToCart,
      removeFromCart,
      removeItem,
      updateQuantity,
      clearCart,
      isLoading,
      mergeConflicts: [] as never[],
      lastMergeSummary: null,
    }),
    [
      cart,
      addToCart,
      removeFromCart,
      removeItem,
      updateQuantity,
      clearCart,
      isLoading,
    ]
  );

  return React.createElement(CartContext.Provider, { value: contextValue }, children);
};

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
