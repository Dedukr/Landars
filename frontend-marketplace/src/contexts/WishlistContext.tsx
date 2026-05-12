"use client";
import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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

function parseStoredGuestWishlist(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is number =>
        typeof id === "number" && Number.isFinite(id) && id > 0
    );
  } catch {
    return [];
  }
}

/** Union of guest product ids (e.g. localStorage + in-memory snapshot before login). */
function combineWishlistIds(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])];
}

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, token, loading: authLoading } = useAuth();
  /** Prior `user` to detect logout (signed-in → signed-out); avoids clearing guest wishlist on normal browsing. */
  const prevUserRef = useRef<typeof user | undefined>(undefined);
  /** Guest wishlist while signed out; used on sign-in if `guest_wishlist` in localStorage lagged behind React state. */
  const guestWishlistSnapshotRef = useRef<number[]>([]);

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
  const loadGuestWishlist = useCallback(() => {
    const stored = localStorage.getItem("guest_wishlist");
    const parsed = parseStoredGuestWishlist(stored);
    const merged = combineWishlistIds(parsed, guestWishlistSnapshotRef.current);
    setWishlist(merged);
  }, []);

  // Save guest wishlist to localStorage
  const saveGuestWishlist = (wishlistItems: number[]) => {
    localStorage.setItem("guest_wishlist", JSON.stringify(wishlistItems));
  };

  /** POST guest-only ids to the account wishlist, then reload from backend. */
  const mergeGuestIntoBackend = useCallback(
    async (guestProductIds: number[]) => {
      if (!user || !token || authLoading || guestProductIds.length === 0) return;

      await new Promise((resolve) => setTimeout(resolve, 100));

      setLoading(true);
      try {
        const data = await httpClient.get<WishlistResponse>("/api/wishlist/");
        const backendIds = new Set(
          data.items.map((item: { product: number }) => item.product)
        );

        for (const productId of guestProductIds) {
          if (!backendIds.has(productId)) {
            try {
              await httpClient.post("/api/wishlist/", { productId });
              backendIds.add(productId);
            } catch {
              // Duplicate or invalid product — continue with remaining ids
            }
          }
        }

        localStorage.removeItem("guest_wishlist");
        guestWishlistSnapshotRef.current = [];

        const refreshed = await httpClient.get<WishlistResponse>("/api/wishlist/");
        setWishlist(
          refreshed.items.map((item: { product: number }) => item.product)
        );
      } catch (error) {
        console.error("Failed to merge guest wishlist into account:", error);
      } finally {
        setLoading(false);
      }
    },
    [user, token, authLoading]
  );

  // Snapshot guest wishlist while signed out (for post-login merge if localStorage lags).
  useEffect(() => {
    if (!user && Array.isArray(wishlist)) {
      guestWishlistSnapshotRef.current = wishlist;
    }
  }, [wishlist, user]);

  // Authenticated: merge guest wishlist (storage + snapshot) into account, then load; guest: load combined local state
  useEffect(() => {
    if (user && token) {
      if (authLoading) return;
      const fromLs = parseStoredGuestWishlist(
        localStorage.getItem("guest_wishlist")
      );
      const combined = combineWishlistIds(
        fromLs,
        guestWishlistSnapshotRef.current
      );
      if (combined.length > 0) {
        void mergeGuestIntoBackend(combined);
      } else {
        void loadWishlistFromBackend();
      }
    } else {
      loadGuestWishlist();
    }
  }, [
    user,
    token,
    authLoading,
    mergeGuestIntoBackend,
    loadGuestWishlist,
    loadWishlistFromBackend,
  ]);

  // Clear wishlist when user transitions from authenticated → anonymous (logout),
  // not on every render while browsing as a guest (that broke guest wishlist + strained the app).
  useEffect(() => {
    const prev = prevUserRef.current;
    if (prev !== undefined && prev !== null && user === null) {
      setWishlist([]);
      localStorage.removeItem("guest_wishlist");
      guestWishlistSnapshotRef.current = [];
    }
    prevUserRef.current = user;
  }, [user]);

  // Listen for logout events
  useEffect(() => {
    const handleLogout = () => {
      setWishlist([]);
      localStorage.removeItem("guest_wishlist");
      guestWishlistSnapshotRef.current = [];
    };

    window.addEventListener("user:logout", handleLogout);
    return () => window.removeEventListener("user:logout", handleLogout);
  }, []);

  // Listen for storage changes (when wishlist is cleared on logout)
  useEffect(() => {
    const handleStorageChange = () => {
      if (!user) {
        // Only handle storage changes for guest users
        const stored = localStorage.getItem("guest_wishlist");
        if (stored) {
          setWishlist(parseStoredGuestWishlist(stored));
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

  const addToWishlist = useCallback(
    async (productId: number) => {
      if (user && token) {
        // User is authenticated - add to backend
        try {
          // Optimistic update
          setWishlist((prev: number[]) => {
            if (!prev.includes(productId)) {
              return [...prev, productId];
            }
            return prev;
          });

          await httpClient.post("/api/wishlist/", {
            productId: productId,
          });

          // Reload from backend to ensure sync
          await loadWishlistFromBackend();
        } catch (error) {
          console.error("Failed to add to wishlist:", error);
          // Revert optimistic update on error
          setWishlist((prev: number[]) =>
            prev.filter((id) => id !== productId)
          );
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
    },
    [user, token, loadWishlistFromBackend]
  );

  const removeFromWishlist = useCallback(
    async (productId: number) => {
      if (user && token) {
        // User is authenticated - remove from backend
        try {
          // Optimistic update
          setWishlist((prev: number[]) =>
            prev.filter((id) => id !== productId)
          );

          await httpClient.request("/api/wishlist/", {
            method: "DELETE",
            body: JSON.stringify({ productId: productId }),
          });

          // Reload from backend to ensure sync
          await loadWishlistFromBackend();
        } catch (error) {
          console.error("Failed to remove from wishlist:", error);
          // Revert optimistic update on error
          setWishlist((prev: number[]) => [...prev, productId]);
        }
      } else {
        // Guest user - remove from local state
        setWishlist((prev: number[]) => prev.filter((id) => id !== productId));
      }
    },
    [user, token, loadWishlistFromBackend]
  );

  const isInWishlist = useCallback(
    (productId: number) => {
      return wishlist.includes(productId);
    },
    [wishlist]
  );

  const clearWishlist = useCallback(async () => {
    if (user && token) {
      // User is authenticated - clear from backend
      const previousWishlist = [...wishlist];
      try {
        // Optimistic update
        setWishlist([]);

        // Get current wishlist items and remove each one
        for (const productId of previousWishlist) {
          await httpClient.request("/api/wishlist/", {
            method: "DELETE",
            body: JSON.stringify({ productId: productId }),
          });
        }

        // Reload from backend to ensure sync
        await loadWishlistFromBackend();
      } catch (error) {
        console.error("Failed to clear wishlist:", error);
        // Revert optimistic update on error
        setWishlist(previousWishlist);
      }
    } else {
      // Guest user - clear local state
      setWishlist([]);
      localStorage.removeItem("guest_wishlist");
      guestWishlistSnapshotRef.current = [];
    }
  }, [user, token, wishlist, loadWishlistFromBackend]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      wishlist,
      addToWishlist,
      removeFromWishlist,
      isInWishlist,
      clearWishlist,
      loading,
    }),
    [
      wishlist,
      addToWishlist,
      removeFromWishlist,
      isInWishlist,
      clearWishlist,
      loading,
    ]
  );

  return React.createElement(
    WishlistContext.Provider,
    {
      value: contextValue,
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
