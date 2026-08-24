import { getAuthUrl, getSafeNextRedirect } from "../authHelpers";

describe("getSafeNextRedirect", () => {
  it("allows normal relative paths", () => {
    expect(getSafeNextRedirect("/shop")).toBe("/shop");
    expect(getSafeNextRedirect("/orders/12")).toBe("/orders/12");
    expect(getSafeNextRedirect("%2Fcart%2F")).toBe("/cart/");
  });

  it("rejects auth and recovery loops", () => {
    expect(getSafeNextRedirect("/auth")).toBeNull();
    expect(getSafeNextRedirect("/auth/")).toBeNull();
    expect(getSafeNextRedirect("/auth/?mode=signin")).toBeNull();
    expect(getSafeNextRedirect("%2Fauth%2F")).toBeNull();
    expect(getSafeNextRedirect("/verify-email?token=x")).toBeNull();
    expect(getSafeNextRedirect("/reset-password")).toBeNull();
  });

  it("rejects external or protocol-relative URLs", () => {
    expect(getSafeNextRedirect("https://evil.com")).toBeNull();
    expect(getSafeNextRedirect("//evil.com")).toBeNull();
    expect(getSafeNextRedirect("")).toBeNull();
    expect(getSafeNextRedirect(null)).toBeNull();
  });
});

describe("getAuthUrl", () => {
  it("omits unsafe next values", () => {
    expect(getAuthUrl({ mode: "signin", next: "/auth/" })).toBe(
      "/auth?mode=signin"
    );
    expect(getAuthUrl({ mode: "signin", next: "/cart" })).toBe(
      "/auth?mode=signin&next=%2Fcart"
    );
  });
});
