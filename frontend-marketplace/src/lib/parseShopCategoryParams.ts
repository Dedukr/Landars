/** Parse `?category=12` or `?categories=18,19,12` from shop URL. */
export function parseShopCategoryParams(
  searchParams: Pick<URLSearchParams, "get">
): number[] {
  const multi = searchParams.get("categories");
  if (multi) {
    return multi
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  const single = searchParams.get("category");
  if (single) {
    const n = parseInt(single, 10);
    return Number.isFinite(n) && n > 0 ? [n] : [];
  }

  return [];
}

/** Stable key for effects when category query params change. */
export function shopCategoryParamKey(
  searchParams: Pick<URLSearchParams, "get">
): string {
  return (
    searchParams.get("categories") ??
    searchParams.get("category") ??
    ""
  );
}

/** Shop links with trailing slash (matches Next `trailingSlash: true`). */
export function buildShopCategoryHref(options: {
  categoryId?: number;
  categoryIds?: readonly number[];
}): string {
  const { categoryId, categoryIds } = options;
  if (categoryIds?.length) {
    return `/shop/?categories=${categoryIds.join(",")}`;
  }
  if (categoryId != null && categoryId > 0) {
    return `/shop/?category=${categoryId}`;
  }
  return "/shop/";
}

/** Shop URL with category filter and optional search query. */
export function buildShopListingHref(options: {
  categoryIds?: number[];
  q?: string;
}): string {
  const params = new URLSearchParams();
  const ids = options.categoryIds ?? [];
  if (ids.length === 1) params.set("category", String(ids[0]));
  else if (ids.length > 1) params.set("categories", ids.join(","));
  const q = options.q?.trim();
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/shop/?${qs}` : "/shop/";
}
