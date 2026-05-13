/**
 * Product list query strings are built by callers (shop filters, home sections, etc.).
 * This helper remains so imports stay stable; it does not inject category filters.
 */
export function scopeProductsQueryString(queryString: string): string {
  return queryString;
}
