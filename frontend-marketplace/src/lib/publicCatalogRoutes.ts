/**
 * Routes where the product catalogue should render without waiting for auth restore.
 */
export function isPublicCatalogRoute(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;

  if (path === "/" || path === "") {
    return true;
  }

  if (path === "/shop" || path.startsWith("/shop/")) {
    return true;
  }

  if (path.startsWith("/product/")) {
    return true;
  }

  if (path === "/festival-menu" || path.startsWith("/festival-menu/")) {
    return true;
  }

  return false;
}

/**
 * Auth/recovery pages that must render immediately (no session-restore spinner).
 */
export function isPublicAuthRoute(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "") || "/";

  return (
    path === "/auth" ||
    path === "/verify-email" ||
    path === "/reset-password"
  );
}

/** Catalog or auth routes that should not block on AuthWrapper loading. */
export function isPublicUnauthenticatedRoute(pathname: string): boolean {
  return isPublicCatalogRoute(pathname) || isPublicAuthRoute(pathname);
}
