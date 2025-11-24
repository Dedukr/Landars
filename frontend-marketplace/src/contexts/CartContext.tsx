"use client";
import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { httpClient } from "@/utils/httpClient";
import {
  createCartMerger,
  type CartMergeResult,
  type CartConflict,
  MergeStrategy,
  ConflictResolution,
  CartMergeError,
} from "@/utils/cartMerger";

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
  clearCart: () => void;
  isLoading: boolean;
  mergeConflicts: CartConflict[];
  lastMergeSummary: CartMergeResult["mergeSummary"] | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<CartConflict[]>([]);
  const [lastMergeSummary, setLastMergeSummary] = useState<
    CartMergeResult["mergeSummary"] | null
  >(null);
  const { user, loading: authLoading } = useAuth();

  // Initialize cart merger with smart strategy
  const cartMerger = React.useMemo(
    () => createCartMerger(MergeStrategy.SMART, ConflictResolution.KEEP_HIGHER),
    []
  );

  /**
   * Intelligently merge local cart with backend cart
   * This replaces the old sync logic that caused duplication
   */
  const mergeCartsIntelligently = React.useCallback(
    async (localItems: CartItem[], backendItems: CartItem[]) => {
      if (authLoading)
        return { mergedCart: [], conflicts: [], mergeSummary: null };

      try {
        // Starting intelligent cart merge

        const mergeResult = await cartMerger.mergeCarts(
          localItems,
          backendItems
        );

        // Cart merge completed successfully

        // Store merge information for user feedback
        setMergeConflicts(mergeResult.conflicts);
        setLastMergeSummary(mergeResult.mergeSummary);

        return mergeResult;
      } catch (error) {
        console.error("❌ Cart merge failed:", error);
        if (error instanceof CartMergeError) {
          console.error("Original error:", error.originalError);
        }
        throw error;
      }
    },
    [authLoading, cartMerger]
  );

  /**
   * Sync merged cart to backend with proper error handling
   */
  const syncMergedCartToBackend = React.useCallback(
    async (mergedCart: CartItem[]) => {
      if (authLoading || mergedCart.length === 0) return;

      try {
        // Syncing merged cart to backend

        // Clear existing backend cart first to avoid conflicts
        await httpClient.delete("/api/cart/");

        // Add each item from merged cart to backend
        for (const item of mergedCart) {
          await httpClient.post("/api/cart/", {
            productId: item.productId,
            quantity: item.quantity,
          });
        }

        // Merged cart synced to backend successfully
      } catch (error) {
        console.error("❌ Failed to sync merged cart to backend:", error);
        throw error;
      }
    },
    [authLoading]
  );

  /**
   * Fetch cart from backend with intelligent merging
   * This replaces the old logic that caused duplication
   */
  const fetchCartFromBackend = React.useCallback(
    async (skipLocalMerge = false) => {
      if (authLoading) return; // Don't fetch while auth is loading```

      setIsLoading(true);
      try {
        // Fetching cart from backend
        const data = await httpClient.get<CartResponse>("/api/cart/");

        // Convert backend cart format to frontend format
        const backendItems = data.items.map(
          (item: { product: number; quantity: string }) => ({
            productId: item.product,
            quantity: parseFloat(item.quantity),
          })
        );

        // If there are local items and we should merge them
        if (!skipLocalMerge) {
          const localCart = localStorage.getItem("cart");
          if (localCart) {
            const localItems = JSON.parse(localCart);
            if (localItems.length > 0) {
              // Found local cart items, merging intelligently

              // Use intelligent merging instead of simple sync
              const mergeResult = await mergeCartsIntelligently(
                localItems,
                backendItems
              );

              // Update cart with merged result
              setCart(mergeResult.mergedCart);

              // Sync merged cart to backend
              await syncMergedCartToBackend(mergeResult.mergedCart);

              // Clear local storage after successful merge
              localStorage.removeItem("cart");

              // Cart merge and sync completed
              return;
            }
          }
        }

        // No local items to merge, just set backend cart
        setCart(backendItems);
        // Backend cart loaded successfully
      } catch (error) {
        console.error("❌ Failed to fetch cart:", error);
        // On error, try to preserve local cart
        const localCart = localStorage.getItem("cart");
        if (localCart) {
          // Using local cart as fallback
          setCart(JSON.parse(localCart));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [authLoading, mergeCartsIntelligently, syncMergedCartToBackend]
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

  const addToCart = useCallback(
    async (productId: number, quantity: number = 1) => {
      if (user) {
        // Add to backend cart
        setIsLoading(true);
        try {
          await httpClient.post("/api/cart/", {
            productId: productId,
            quantity: quantity,
          });

          // Update local state with optimistic update
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
          // Revert optimistic update on error
          setCart((prev: CartItem[]) => {
            const existing = prev.find(
              (item: CartItem) => item.productId === productId
            );
            if (existing && existing.quantity > quantity) {
              return prev.map((item: CartItem) =>
                item.productId === productId
                  ? { ...item, quantity: item.quantity - quantity }
                  : item
              );
            } else if (existing && existing.quantity === quantity) {
              return prev.filter(
                (item: CartItem) => item.productId !== productId
              );
            }
            return prev;
          });
        } finally {
          setIsLoading(false);
        }
      } else {
        // Add to local cart with optimistic update
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
    },
    [user]
  );

  const removeFromCart = useCallback(
    async (productId: number) => {
      if (user) {
        // Remove from backend cart
        setIsLoading(true);
        try {
          const existing = cart.find((item) => item.productId === productId);
          if (!existing) return;

          const newQuantity = existing.quantity - 1;

          // Optimistic update
          if (newQuantity <= 0) {
            setCart((prev: CartItem[]) =>
              prev.filter((item: CartItem) => item.productId !== productId)
            );

            // Delete the item from backend
            await httpClient.request("/api/cart/", {
              method: "DELETE",
              body: JSON.stringify({ productId: productId }),
            });
          } else {
            setCart((prev: CartItem[]) =>
              prev.map((item: CartItem) =>
                item.productId === productId
                  ? { ...item, quantity: newQuantity }
                  : item
              )
            );

            // Update quantity in backend
            await httpClient.patch("/api/cart/", {
              productId: productId,
              quantity: newQuantity,
            });
          }
        } catch (error) {
          console.error("Failed to remove from cart:", error);
          // Revert optimistic update on error
          setCart((prev: CartItem[]) => {
            const existing = prev.find((item) => item.productId === productId);
            if (!existing) {
              // Item was removed, restore it
              return [...prev, { productId, quantity: 1 }];
            }
            return prev;
          });
        } finally {
          setIsLoading(false);
        }
      } else {
        // Remove from local cart with optimistic update
        setCart((prev: CartItem[]) => {
          const existing = prev.find(
            (item: CartItem) => item.productId === productId
          );
          if (!existing) return prev;
          if (existing.quantity <= 1) {
            return prev.filter(
              (item: CartItem) => item.productId !== productId
            );
          } else {
            return prev.map((item: CartItem) =>
              item.productId === productId
                ? { ...item, quantity: item.quantity - 1 }
                : item
            );
          }
        });
      }
    },
    [user, cart]
  );

  const removeItem = useCallback(
    async (productId: number) => {
      if (user) {
        // Remove entire item from backend cart
        setIsLoading(true);
        const previousCart = [...cart];
        try {
          // Optimistic update
          setCart((prev: CartItem[]) =>
            prev.filter((item: CartItem) => item.productId !== productId)
          );

          await httpClient.patch("/api/cart/", {
            productId: productId,
            quantity: 0,
          });
        } catch (error) {
          console.error("Failed to remove item from cart:", error);
          // Revert optimistic update on error
          const removedItem = previousCart.find(
            (item) => item.productId === productId
          );
          if (removedItem) {
            setCart((prev: CartItem[]) => [...prev, removedItem]);
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        // Remove entire item from local cart
        setCart((prev: CartItem[]) =>
          prev.filter((item: CartItem) => item.productId !== productId)
        );
      }
    },
    [user, cart]
  );

  const clearCart = useCallback(async () => {
    if (user) {
      // Clear backend cart
      setIsLoading(true);
      const previousCart = [...cart]; // Move outside try block
      try {
        // Optimistic update
        setCart([]);

        await httpClient.delete("/api/cart/");
      } catch (error) {
        const status =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          (error as { response?: { status?: number } }).response?.status;

        if (status === 404) {
          // Cart already removed on the backend (e.g., after checkout). Treat as success.
          console.warn("Cart already deleted on backend. Skipping revert.");
        } else {
          console.error("Failed to clear cart:", error);
          // Revert optimistic update on error
          setCart(previousCart);
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Clear local cart
      setCart([]);
    }
  }, [user, cart]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      cart,
      addToCart,
      removeFromCart,
      removeItem,
      clearCart,
      isLoading,
      mergeConflicts,
      lastMergeSummary,
    }),
    [
      cart,
      addToCart,
      removeFromCart,
      removeItem,
      clearCart,
      isLoading,
      mergeConflicts,
      lastMergeSummary,
    ]
  );

  return React.createElement(
    CartContext.Provider,
    {
      value: contextValue,
    },
    children
  );
};

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
