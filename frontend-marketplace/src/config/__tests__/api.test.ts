import "@testing-library/jest-dom";
import { getClientApiBaseUrl } from "../api";

/**
 * Browser branch (jsdom): the site is always served with /api on the visitor's own origin,
 * so the client base URL must ALWAYS be "" (same-origin relative URLs), whatever build-time
 * NEXT_PUBLIC_API_BASE_URL says. (Visitor host here is jsdom's default: localhost.)
 */
describe("getClientApiBaseUrl (browser)", () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = original;
    }
  });

  test("runs in a browser-like environment", () => {
    expect(typeof window).toBe("object");
    expect(window.location.hostname).toBe("localhost");
  });

  test.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["localhost with port", "http://localhost:3000"],
    ["https localhost", "https://localhost"],
    ["loopback IP", "http://127.0.0.1:8000"],
    ["production apex origin (differs from the visitor host)", "https://landarsfood.com"],
    ["production www origin", "https://www.landarsfood.com"],
    ["trailing slash", "https://landarsfood.com/"],
    ["surrounding whitespace", "  https://landarsfood.com  "],
    ["another domain entirely", "https://api.example.org"],
    ["garbage that is not a URL", "not a url"],
  ])("returns an empty (same-origin) base when configured is %s", (_name, configured) => {
    if (configured === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = configured;
    }

    expect(getClientApiBaseUrl()).toBe("");
  });
});
