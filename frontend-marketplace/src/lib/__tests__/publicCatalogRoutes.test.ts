import { isPublicAuthRoute, isPublicCatalogRoute } from "@/lib/publicCatalogRoutes";

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
    expect(isPublicCatalogRoute("/festival-menu/")).toBe(true);
  });

  it("blocks checkout and account routes", () => {
    expect(isPublicCatalogRoute("/checkout/")).toBe(false);
    expect(isPublicCatalogRoute("/profile/")).toBe(false);
    expect(isPublicCatalogRoute("/cart/")).toBe(false);
    expect(isPublicCatalogRoute("/auth/")).toBe(false);
  });
});

describe("isPublicAuthRoute", () => {
  it("allows auth and recovery pages", () => {
    expect(isPublicAuthRoute("/auth")).toBe(true);
    expect(isPublicAuthRoute("/auth/")).toBe(true);
    expect(isPublicAuthRoute("/auth?mode=signup")).toBe(true);
    expect(isPublicAuthRoute("/verify-email")).toBe(true);
    expect(isPublicAuthRoute("/verify-email?token=x")).toBe(true);
    expect(isPublicAuthRoute("/reset-password")).toBe(true);
  });

  it("blocks catalog and checkout", () => {
    expect(isPublicAuthRoute("/")).toBe(false);
    expect(isPublicAuthRoute("/shop")).toBe(false);
    expect(isPublicAuthRoute("/checkout/")).toBe(false);
  });
});
