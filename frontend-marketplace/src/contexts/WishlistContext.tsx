"use client";
import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { httpClient } from "@/utils/httpClient";

interface WishlistResponse {
  items: Array<{
    id: number;
    product: number;
    product_name: string;
    product_price: string;
    product_description: string;
    product_categories: string[];
    added_date: string;
  }>;
  total_items: number;
}

interface WishlistContextType {
  wishlist: number[];
  addToWishlist: (productId: number) => void;
  removeFromWishlist: (productId: number) => void;
  isInWishlist: (productId: number) => boolean;
  clearWishlist: () => void;
  loading: boolean;
}

const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined
);

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, token, loading: authLoading } = useAuth();

  // Load wishlist from backend when user is authenticated
  const loadWishlistFromBackend = useCallback(async () => {
    if (!user || !token || authLoading) return;

    // Add a small delay to prevent race conditions with auth
    await new Promise((resolve) => setTimeout(resolve, 100));

    setLoading(true);
    try {
      const data = await httpClient.get<WishlistResponse>("/api/wishlist/");
      const productIds = data.items.map(
        (item: { product: number }) => item.product
      );
      setWishlist(productIds);
    } catch (error) {
      console.error("Failed to load wishlist:", error);
    } finally {
      setLoading(false);
    }
  }, [user, token, authLoading]);

  // Load wishlist from localStorage for guest users
  const loadGuestWishlist = () => {
    const stored = localStorage.getItem("guest_wishlist");
    if (stored) {
      setWishlist(JSON.parse(stored));
    }
  };

  // Save guest wishlist to localStorage
  const saveGuestWishlist = (wishlistItems: number[]) => {
    localStorage.setItem("guest_wishlist", JSON.stringify(wishlistItems));
  };

  // Merge guest wishlist with user's backend wishlist
  const mergeWishlists = useCallback(
    async (guestWishlist: number[]) => {
      if (!user || !token || guestWishlist.length === 0) return;

      try {
        // Add each guest wishlist item to backend
        for (const productId of guestWishlist) {
          await httpClient.post("/api/wishlist/", {
            productId: productId,
          });
        }

        // Clear guest wishlist after merging
        localStorage.removeItem("guest_wishlist");
      } catch (error) {
        console.error("Failed to merge wishlists:", error);
      }
    },
    [user, token]
  );

  // Load wishlist on mount and when auth state changes
  useEffect(() => {
    if (user && token) {
      // User is authenticated - load from backend
      loadWishlistFromBackend();
    } else {
      // User is not authenticated - load from localStorage
      loadGuestWishlist();
    }
  }, [user, token, loadWishlistFromBackend]);

  // Handle login - merge guest wishlist with user's backend wishlist
  useEffect(() => {
    if (user && token) {
      const guestWishlist = localStorage.getItem("guest_wishlist");
      if (guestWishlist) {
        const guestItems = JSON.parse(guestWishlist);
        mergeWishlists(guestItems);
      }
    }
  }, [user, token, mergeWishlists]);

  // Listen for storage changes (when wishlist is cleared on logout)
  useEffect(() => {
    const handleStorageChange = () => {
      if (!user) {
        // Only handle storage changes for guest users
        const stored = localStorage.getItem("guest_wishlist");
        if (stored) {
          setWishlist(JSON.parse(stored));
        } else {
          setWishlist([]);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [user]);

  // Save guest wishlist to localStorage when it changes (only for unauthenticated users)
  useEffect(() => {
    if (!user) {
      saveGuestWishlist(wishlist);
    }
  }, [wishlist, user]);

  const addToWishlist = async (productId: number) => {
    if (user && token) {
      // User is authenticated - add to backend
      try {
        await httpClient.post("/api/wishlist/", {
          productId: productId,
        });

        setWishlist((prev: number[]) => {
          if (!prev.includes(productId)) {
            return [...prev, productId];
          }
          return prev;
        });
      } catch (error) {
        console.error("Failed to add to wishlist:", error);
      }
    } else {
      // Guest user - add to local state
      setWishlist((prev: number[]) => {
        if (!prev.includes(productId)) {
          return [...prev, productId];
        }
        return prev;
      });
    }
  };

  const removeFromWishlist = async (productId: number) => {
    if (user && token) {
      // User is authenticated - remove from backend
      try {
        await httpClient.request("/api/wishlist/", {
          method: "DELETE",
          body: JSON.stringify({ productId: productId }),
        });

        setWishlist((prev: number[]) => prev.filter((id) => id !== productId));
      } catch (error) {
        console.error("Failed to remove from wishlist:", error);
      }
    } else {
      // Guest user - remove from local state
      setWishlist((prev: number[]) => prev.filter((id) => id !== productId));
    }
  };

  const isInWishlist = (productId: number) => {
    return wishlist.includes(productId);
  };

  const clearWishlist = async () => {
    if (user && token) {
      // User is authenticated - clear from backend
      try {
        // Get current wishlist items and remove each one
        const currentWishlist = [...wishlist];
        for (const productId of currentWishlist) {
          await httpClient.request("/api/wishlist/", {
            method: "DELETE",
            body: JSON.stringify({ productId: productId }),
          });
        }
        setWishlist([]);
      } catch (error) {
        console.error("Failed to clear wishlist:", error);
      }
    } else {
      // Guest user - clear local state
      setWishlist([]);
      localStorage.removeItem("guest_wishlist");
    }
  };

  return React.createElement(
    WishlistContext.Provider,
    {
      value: {
        wishlist,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        clearWishlist,
        loading,
      },
    },
    children
  );
};

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx)
    throw new Error("useWishlist must be used within a WishlistProvider");
  return ctx;
}
