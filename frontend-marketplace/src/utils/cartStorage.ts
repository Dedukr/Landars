/** Legacy guest cart key — cleared on logout so stale lines are not restored. */
export const CART_STORAGE_KEY = "cart";

export function clearCartStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_STORAGE_KEY);
}
