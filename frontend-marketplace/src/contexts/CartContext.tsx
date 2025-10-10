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
        console.log("🔄 Starting intelligent cart merge...");
        console.log("Local items:", localItems);
        console.log("Backend items:", backendItems);

        const mergeResult = await cartMerger.mergeCarts(
          localItems,
          backendItems
        );

        console.log("✅ Cart merge completed:", mergeResult);

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
        console.log("🔄 Syncing merged cart to backend...", mergedCart);

        // Clear existing backend cart first to avoid conflicts
        await httpClient.delete("/api/cart/");

        // Add each item from merged cart to backend
        for (const item of mergedCart) {
          await httpClient.post("/api/cart/", {
            productId: item.productId,
            quantity: item.quantity,
          });
        }

        console.log("✅ Merged cart synced to backend successfully");
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
        console.log("🔄 Fetching cart from backend...");
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
              console.log(
                "🔄 Found local cart items, merging intelligently..."
              );

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

              console.log("✅ Cart merge and sync completed");
              return;
            }
          }
        }

        // No local items to merge, just set backend cart
        setCart(backendItems);
        console.log("✅ Backend cart loaded:", backendItems);
      } catch (error) {
        console.error("❌ Failed to fetch cart:", error);
        // On error, try to preserve local cart
        const localCart = localStorage.getItem("cart");
        if (localCart) {
          console.log("⚠️ Using local cart as fallback");
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
        mergeConflicts,
        lastMergeSummary,
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
