import { clearListingProductsCache } from "@/utils/listingProductCache";

/** Keys used for wishlist persistence in the marketplace app. */
export const GUEST_WISHLIST_STORAGE_KEY = "guest_wishlist";
export const LEGACY_WISHLIST_STORAGE_KEY = "wishlist";

const AUTH_WISHLIST_SNAPSHOT_PREFIX = "auth_wishlist_v1";

function authWishlistSnapshotKey(userId: number): string {
  return `${AUTH_WISHLIST_SNAPSHOT_PREFIX}_${userId}`;
}

export function readAuthenticatedWishlistSnapshot(userId: number): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(authWishlistSnapshotKey(userId));
    return parseStoredGuestWishlist(raw);
  } catch {
    return null;
  }
}

export function writeAuthenticatedWishlistSnapshot(
  userId: number,
  productIds: number[]
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      authWishlistSnapshotKey(userId),
      JSON.stringify(productIds)
    );
  } catch {
    // ignore
  }
}

/** Remove all client-side wishlist keys (guest + legacy + optional signed-in snapshot). */
export function clearWishlistStorage(userId?: number): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_WISHLIST_STORAGE_KEY);
  localStorage.removeItem(LEGACY_WISHLIST_STORAGE_KEY);
  if (userId != null) {
    localStorage.removeItem(authWishlistSnapshotKey(userId));
    clearListingProductsCache("wishlist", userId);
  }
}

export function parseStoredGuestWishlist(raw: string | null): number[] {
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
