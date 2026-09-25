/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.landarsfood.com/"}
 */
import "@testing-library/jest-dom";
import { getClientApiBaseUrl } from "../api";

/**
 * The audited production defect: the bundle was built with
 * NEXT_PUBLIC_API_BASE_URL=https://landarsfood.com but the visitor is on
 * www.landarsfood.com, so every API call went cross-origin (and hit a wrong CORS header).
 */
describe("getClientApiBaseUrl on www.landarsfood.com", () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = original;
    }
  });

  test("visitor host is www", () => {
    expect(window.location.hostname).toBe("www.landarsfood.com");
  });

  test("apex configured origin does NOT make the browser cross-origin", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://landarsfood.com";

    expect(getClientApiBaseUrl()).toBe("");
  });

  test("www configured origin (same host) stays same-origin", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://www.landarsfood.com";

    expect(getClientApiBaseUrl()).toBe("");
  });

  test("a dev-style localhost origin baked into the bundle is ignored too", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://localhost:3000";

    expect(getClientApiBaseUrl()).toBe("");
  });

  test("unset stays same-origin", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    expect(getClientApiBaseUrl()).toBe("");
  });
});
