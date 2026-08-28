import { clearListingProductsCache } from "@/utils/listingProductCache";

/** Legacy guest cart key — cleared on logout so stale lines are not restored. */
export const CART_STORAGE_KEY = "cart";

const CART_SNAPSHOT_PREFIX = "cart_snapshot_v1";

export interface PersistedCartItem {
  productId: number;
  quantity: number;
}

function cartSnapshotKey(userId: number): string {
  return `${CART_SNAPSHOT_PREFIX}_${userId}`;
}

export function readCartSnapshot(userId: number): PersistedCartItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cartSnapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((row) => {
        if (typeof row !== "object" || row === null) return null;
        const productId = (row as PersistedCartItem).productId;
        const quantity = (row as PersistedCartItem).quantity;
        if (
          typeof productId !== "number" ||
          !Number.isFinite(productId) ||
          typeof quantity !== "number" ||
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          return null;
        }
        return { productId, quantity };
      })
      .filter((row): row is PersistedCartItem => row !== null);
  } catch {
    return null;
  }
}

export function writeCartSnapshot(
  userId: number,
  items: PersistedCartItem[]
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cartSnapshotKey(userId), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function clearCartStorage(userId?: number): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_STORAGE_KEY);
  if (userId != null) {
    localStorage.removeItem(cartSnapshotKey(userId));
    clearListingProductsCache("cart", userId);
  }
}
