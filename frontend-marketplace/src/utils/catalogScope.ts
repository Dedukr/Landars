/**
 * Temporary frontend-only catalog scope.
 *
 * Forces all product LIST fetches to category id 16.
 */
export const SCOPED_CATEGORY_ID = 16;

export function scopeProductsQueryString(
  queryString: string
): string {
  const params = new URLSearchParams(queryString);
  // Always enforce the scoped category, regardless of existing category filters.
  params.set("categories", String(SCOPED_CATEGORY_ID));
  return params.toString();
}

