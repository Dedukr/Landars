"use client";
import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { httpClient } from "@/utils/httpClient";
import {
  clearWishlistStorage,
  GUEST_WISHLIST_STORAGE_KEY,
  parseStoredGuestWishlist,
} from "@/utils/wishlistStorage";

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

/** Union of guest product ids (e.g. localStorage + in-memory snapshot before login). */
function combineWishlistIds(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])];
}

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, token, loading: authLoading } = useAuth();
  /** Prior `user` to detect logout (signed-in → signed-out). */
  const prevUserRef = useRef<typeof user | undefined>(undefined);
  /** Guest wishlist while signed out; used on sign-in if storage lagged behind React state. */
  const guestWishlistSnapshotRef = useRef<number[]>([]);
  /** Skip one guest persist after logout so stale in-memory ids are not re-written. */
  const skipGuestPersistRef = useRef(false);

  const resetWishlistState = useCallback(() => {
    skipGuestPersistRef.current = true;
    setWishlist([]);
    clearWishlistStorage();
    guestWishlistSnapshotRef.current = [];
  }, []);

  const handleSessionLogout = useCallback(() => {
    resetWishlistState();
  }, [resetWishlistState]);

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
    const stored = localStorage.getItem(GUEST_WISHLIST_STORAGE_KEY);
    const parsed = parseStoredGuestWishlist(stored);
    const merged = combineWishlistIds(parsed, guestWishlistSnapshotRef.current);
    setWishlist(merged);
  }, []);

  const saveGuestWishlist = (wishlistItems: number[]) => {
    localStorage.setItem(
      GUEST_WISHLIST_STORAGE_KEY,
      JSON.stringify(wishlistItems)
    );
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

        clearWishlistStorage();
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

  // Snapshot guest likes only while browsing as a guest — never copy server wishlist on logout.
  useEffect(() => {
    const prev = prevUserRef.current;
    const browsingAsGuest =
      prev === null || prev === undefined;
    if (!user && browsingAsGuest) {
      guestWishlistSnapshotRef.current = wishlist;
    }
  }, [wishlist, user]);

  // Authenticated: merge guest wishlist then load; guest: load storage; logout: clear (no reload).
  useEffect(() => {
    if (user && token) {
      if (authLoading) return;
      const fromLs = parseStoredGuestWishlist(
        localStorage.getItem(GUEST_WISHLIST_STORAGE_KEY)
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
      return;
    }

    const wasAuthenticated =
      prevUserRef.current !== undefined && prevUserRef.current !== null;
    if (wasAuthenticated) {
      resetWishlistState();
      return;
    }

    loadGuestWishlist();
  }, [
    user,
    token,
    authLoading,
    mergeGuestIntoBackend,
    loadGuestWishlist,
    loadWishlistFromBackend,
    resetWishlistState,
  ]);

  useLayoutEffect(() => {
    const prev = prevUserRef.current;
    if (prev !== undefined && prev !== null && user === null) {
      resetWishlistState();
    }
    prevUserRef.current = user;
  }, [user, resetWishlistState]);

  useEffect(() => {
    window.addEventListener("user:logout", handleSessionLogout);
    window.addEventListener("auth:logout", handleSessionLogout);
    return () => {
      window.removeEventListener("user:logout", handleSessionLogout);
      window.removeEventListener("auth:logout", handleSessionLogout);
    };
  }, [handleSessionLogout]);

  useEffect(() => {
    const handleStorageChange = () => {
      if (!user) {
        const stored = localStorage.getItem(GUEST_WISHLIST_STORAGE_KEY);
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
      if (skipGuestPersistRef.current) {
        skipGuestPersistRef.current = false;
        return;
      }
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
      resetWishlistState();
    }
  }, [user, token, wishlist, loadWishlistFromBackend, resetWishlistState]);

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
