import type { ApiCategoryGroup } from "@/lib/prepareHomeDisplayCategories";

let cached: ApiCategoryGroup[] | null = null;
let fetchPromise: Promise<ApiCategoryGroup[]> | null = null;

function normalizeCategoryGroups(data: unknown): ApiCategoryGroup[] {
  if (Array.isArray(data)) return data as ApiCategoryGroup[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    if (Array.isArray(results)) return results as ApiCategoryGroup[];
  }
  return [];
}

export async function fetchCategoryGroups(): Promise<ApiCategoryGroup[]> {
  if (cached) return cached;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/api/category-groups/")
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      const groups = normalizeCategoryGroups(data).map((group) => ({
        ...group,
        category_ids: (group.category_ids ?? []).map((id) => Number(id)),
      }));
      cached = groups;
      return cached;
    })
    .catch(() => [] as ApiCategoryGroup[])
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}
