/** Read the last known signed-in user id from localStorage (sync, for cache hydration). */
export function getPersistedUserId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const data = JSON.parse(raw) as { id?: unknown };
    return typeof data.id === "number" && Number.isFinite(data.id) ? data.id : null;
  } catch {
    return null;
  }
}
