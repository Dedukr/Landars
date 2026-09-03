import { isPublicCatalogRoute } from "@/lib/publicCatalogRoutes";

describe("isPublicCatalogRoute", () => {
  it("allows home", () => {
    expect(isPublicCatalogRoute("/")).toBe(true);
    expect(isPublicCatalogRoute("")).toBe(true);
  });

  it("allows shop", () => {
    expect(isPublicCatalogRoute("/shop")).toBe(true);
    expect(isPublicCatalogRoute("/shop/")).toBe(true);
    expect(isPublicCatalogRoute("/shop/?category=3")).toBe(true);
  });

  it("allows product detail", () => {
    expect(isPublicCatalogRoute("/product/42/")).toBe(true);
    expect(isPublicCatalogRoute("/product/42")).toBe(true);
  });

  it("allows festival menu", () => {
    expect(isPublicCatalogRoute("/festival-menu")).toBe(true);
  });

  it("blocks checkout and account routes", () => {
    expect(isPublicCatalogRoute("/checkout/")).toBe(false);
    expect(isPublicCatalogRoute("/profile/")).toBe(false);
    expect(isPublicCatalogRoute("/cart/")).toBe(false);
    expect(isPublicCatalogRoute("/auth/")).toBe(false);
  });
});
