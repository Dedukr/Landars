import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";
import {
  CATEGORY_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/utils/fetchWithTimeout";

const CATEGORY_GROUPS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type CategoryGroupsCacheEntry = {
  data: ApiCategoryGroup[];
  fetchedAt: number;
};

let cached: CategoryGroupsCacheEntry | null = null;
let fetchPromise: Promise<ApiCategoryGroup[]> | null = null;

function normalizeCategoryGroups(data: unknown): ApiCategoryGroup[] {
  if (Array.isArray(data)) return data as ApiCategoryGroup[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    if (Array.isArray(results)) return results as ApiCategoryGroup[];
  }
  return [];
}

function isCacheFresh(entry: CategoryGroupsCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CATEGORY_GROUPS_CACHE_TTL_MS;
}

async function fetchCategoryGroupsFromNetwork(): Promise<ApiCategoryGroup[]> {
  const res = await fetchWithTimeout(
    "/api/category-groups/",
    { headers: { Accept: "application/json" } },
    CATEGORY_FETCH_TIMEOUT_MS
  );
  if (!res.ok) return [];
  const data = await res.json();
  const groups = normalizeCategoryGroups(data).map((group) => ({
    ...group,
    category_ids: (group.category_ids ?? []).map((id) => Number(id)),
  }));
  cached = { data: groups, fetchedAt: Date.now() };
  return groups;
}

export async function fetchCategoryGroups(): Promise<ApiCategoryGroup[]> {
  if (cached && isCacheFresh(cached)) {
    return cached.data;
  }

  if (fetchPromise) return fetchPromise;

  fetchPromise = fetchCategoryGroupsFromNetwork()
    .catch(() => {
      if (cached) return cached.data;
      return [] as ApiCategoryGroup[];
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

/** @internal Test helper */
export function clearCategoryGroupsCacheForTests(): void {
  cached = null;
  fetchPromise = null;
}
