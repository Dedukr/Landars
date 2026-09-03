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

  if (path === "/festival-menu") {
    return true;
  }

  return false;
}
