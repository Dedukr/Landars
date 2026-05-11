/** Normalize APIs that sometimes return `{ results: T[] }` instead of a raw array. */
export function normalizeListResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const r = (data as { results?: unknown }).results;
    if (Array.isArray(r)) return r as T[];
  }
  return [];
}
