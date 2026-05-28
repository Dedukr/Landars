import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";

let cached: ApiCategoryGroup[] | null = null;
let fetchPromise: Promise<ApiCategoryGroup[]> | null = null;

export async function fetchCategoryGroups(): Promise<ApiCategoryGroup[]> {
  if (cached) return cached;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/category-groups/")
    .then(async (res) => {
      if (!res.ok) return [];
      const data = (await res.json()) as ApiCategoryGroup[];
      cached = Array.isArray(data) ? data : [];
      return cached;
    })
    .catch(() => [] as ApiCategoryGroup[])
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}
