/** Keys used for wishlist persistence in the marketplace app. */
export const GUEST_WISHLIST_STORAGE_KEY = "guest_wishlist";
export const LEGACY_WISHLIST_STORAGE_KEY = "wishlist";

/** Remove all client-side wishlist keys (guest + legacy). */
export function clearWishlistStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_WISHLIST_STORAGE_KEY);
  localStorage.removeItem(LEGACY_WISHLIST_STORAGE_KEY);
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
