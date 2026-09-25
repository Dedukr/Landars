/**
 * HTTP Client Tests
 *
 * Clean, professional tests for the HTTP client with automatic token refresh
 * Following Jest best practices for mocking fetch and storage
 */

import {
  type HttpError,
  httpClient,
  refreshAuthTokens,
  refreshAuthTokensDetailed,
  resetCSRFToken,
} from "../httpClient";
import { clearAccessToken, setAccessToken } from "../authTokenStore";
import { reportAuthClientEvent } from "../authTelemetry";

// Telemetry is best-effort and uses fetch/sendBeacon itself; keep it out of the fetch call
// counts asserted below and assert what would have been reported instead.
jest.mock("../authTelemetry", () => ({ reportAuthClientEvent: jest.fn() }));
const mockReport = reportAuthClientEvent as jest.Mock;

// Constants — browser client uses same-origin relative URLs
const CSRF_TOKEN_URL = `/api/auth/csrf-token/`;
const TOKEN_REFRESH_URL = `/api/auth/token/refresh/`;
const TEST_API_URL = `/api/test`;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// Mock localStorage / sessionStorage
const localStorageData: Record<string, string> = {};
const sessionStorageData: Record<string, string> = {};

function makeStorageMock(store: Record<string, string>) {
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
  };
}

Object.defineProperty(window, "localStorage", {
  value: makeStorageMock(localStorageData),
  writable: true,
});

Object.defineProperty(window, "sessionStorage", {
  value: makeStorageMock(sessionStorageData),
  writable: true,
});

// Mock window.dispatchEvent for logout testing
const mockDispatchEvent = jest.fn();
const originalDispatchEvent = window.dispatchEvent;

describe("HttpClient", () => {
  beforeEach(() => {
    // Clear all mocks (mockReset also drops unconsumed once-values from a previous test)
    jest.clearAllMocks();
    mockFetch.mockReset();

    Object.keys(localStorageData).forEach((key) => delete localStorageData[key]);
    Object.keys(sessionStorageData).forEach((key) => delete sessionStorageData[key]);
    clearAccessToken();

    // Reset CSRF token state
    resetCSRFToken();

    // Reset window.dispatchEvent
    window.dispatchEvent = mockDispatchEvent;
  });

  afterAll(() => {
    window.dispatchEvent = originalDispatchEvent;
  });

  describe("Basic HTTP Methods", () => {
    beforeEach(() => {
      // Setup: Mock CSRF token fetch and successful response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });
    });

    test("GET request should work", async () => {
      const result = await httpClient.get("/api/test");

      expect(result).toEqual({ data: "success" });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: CSRF token fetch
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        CSRF_TOKEN_URL,
        expect.any(Object)
      );

      // Second call: Actual GET request
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        TEST_API_URL,
        expect.objectContaining({ method: "GET" })
      );
    });

    test("POST request should work", async () => {
      const testData = { name: "test" };
      const result = await httpClient.post("/api/test", testData);

      expect(result).toEqual({ data: "success" });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second call should be POST with data
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        TEST_API_URL,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(testData),
        })
      );
    });

    test("PUT request should work", async () => {
      const testData = { name: "updated" };
      const result = await httpClient.put("/api/test", testData);

      expect(result).toEqual({ data: "success" });

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        TEST_API_URL,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(testData),
        })
      );
    });

    test("PATCH request should work", async () => {
      const testData = { name: "patched" };
      const result = await httpClient.patch("/api/test", testData);

      expect(result).toEqual({ data: "success" });

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        TEST_API_URL,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(testData),
        })
      );
    });

    test("DELETE request should work", async () => {
      const result = await httpClient.delete("/api/test");

      expect(result).toEqual({ data: "success" });

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        TEST_API_URL,
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("CSRF Token Management", () => {
    test("should fetch CSRF token on first request", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "new-csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      await httpClient.get("/api/test");

      // Should make 2 calls: CSRF fetch + actual request
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        CSRF_TOKEN_URL,
        expect.any(Object)
      );
    });

    test("should use cached CSRF token for subsequent requests", async () => {
      // First request: fetch CSRF token + make request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "cached-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "first" }),
        });

      await httpClient.get("/api/first");

      mockFetch.mockClear();

      // Second request: should use cached CSRF token (no fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: "second" }),
      });

      await httpClient.get("/api/second");

      // Should only make 1 call (no CSRF fetch)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should include CSRF token in request headers", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "test-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      await httpClient.get("/api/test");

      const actualRequestCall = mockFetch.mock.calls[1];
      const headers = actualRequestCall[1].headers;

      expect(headers.get("X-CSRFToken")).toBe("test-token");
    });
  });

  describe("Authentication", () => {
    test("should include auth token in requests when available", async () => {
      setAccessToken("test-auth-token");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      await httpClient.get("/api/test");

      const actualRequestCall = mockFetch.mock.calls[1];
      const headers = actualRequestCall[1].headers;

      expect(headers.get("Authorization")).toBe("Bearer test-auth-token");
    });

    test("should skip auth token when skipAuth is true", async () => {
      setAccessToken("test-auth-token");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "test-csrf" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      await httpClient.get("/api/test", { skipAuth: true });

      const actualRequestCall = mockFetch.mock.calls[1];
      const headers = actualRequestCall[1].headers;

      expect(headers.has("Authorization")).toBe(false);
    });
  });

  describe("Token Refresh Flow", () => {
    test("should refresh token and retry on 401 response", async () => {
      setAccessToken("expired-token");

      mockFetch
        // Call 1: CSRF token fetch (initial request)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        // Call 2: Initial request returns 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Token expired" }),
        })
        // Call 3: Token refresh succeeds (cookie-based; empty body)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access: "new-access-token",
          }),
        })
        // Call 4: Retry request succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      const result = await httpClient.get("/api/test");

      expect(result).toEqual({ data: "success" });
      expect(sessionStorageData["authToken"]).toBe("new-access-token");
      expect(localStorageData["refreshToken"]).toBeUndefined();

      expect(mockFetch).toHaveBeenCalledTimes(4);

      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        TOKEN_REFRESH_URL,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({}),
          credentials: "include",
        })
      );
    });

    test("should trigger logout when refresh fails", async () => {
      setAccessToken("expired-token");
      localStorageData["user"] = "{}";
      localStorageData["wishlist"] = "[]";

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Token expired" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid refresh token" }),
        });

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Authentication failed. Please log in again."
      );

      expect(sessionStorageData["authToken"]).toBeUndefined();
      expect(localStorageData["user"]).toBeUndefined();
      expect(localStorageData["wishlist"]).toBeUndefined();

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "auth:logout" })
      );
    });

    test("cookie-only refresh failure preserves guest wishlist", async () => {
      // No prior access token (cookie probe for anonymous / cookie-only restore)
      localStorageData["guest_wishlist"] = "[1,2]";
      localStorageData["user"] = '{"id":1}';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "No refresh cookie" }),
        });

      const success = await refreshAuthTokens();

      expect(success).toBe(false);
      expect(localStorageData["user"]).toBeUndefined();
      expect(localStorageData["guest_wishlist"]).toBe("[1,2]");
      expect(mockDispatchEvent).not.toHaveBeenCalled();
    });

    test("refresh failure with prior access clears wishlist keys", async () => {
      setAccessToken("expired-token");
      localStorageData["guest_wishlist"] = "[9]";
      localStorageData["wishlist"] = "[8]";
      localStorageData["user"] = "{}";

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid refresh" }),
        });

      const success = await refreshAuthTokens();

      expect(success).toBe(false);
      expect(localStorageData["user"]).toBeUndefined();
      expect(localStorageData["wishlist"]).toBeUndefined();
      expect(localStorageData["guest_wishlist"]).toBeUndefined();
      expect(sessionStorageData["authToken"]).toBeUndefined();
    });

    test("should not retry when maxRetries is reached", async () => {
      setAccessToken("expired-token");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Token expired" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access: "new-token",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Still expired" }),
        });

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Still expired"
      );

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("Error Handling", () => {
    test("should handle HTTP errors (4xx/5xx)", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: async () => ({ error: "Invalid data" }),
        });

      await expect(httpClient.get("/api/test")).rejects.toThrow("Invalid data");
    });

    test("should handle network errors", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockRejectedValueOnce(new Error("Network failure"));

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Network failure"
      );
    });

    test("should handle CSRF token fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server error" }),
      });

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Failed to fetch CSRF token"
      );
    });
  });

  describe("Request Configuration", () => {
    test("should skip CSRF token when skipCSRF is true", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: "success" }),
      });

      await httpClient.get("/api/test", { skipCSRF: true });

      // Should only make 1 call (no CSRF fetch)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(TEST_API_URL, expect.any(Object));
    });

    test("should honor timeoutMs via fetchWithTimeout", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      await httpClient.post(
        "/api/auth/register/",
        { email: "a@b.com" },
        { skipAuth: true, skipCSRF: true, timeoutMs: 5000 }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.signal).toBeDefined();
    });

    test("should include custom headers", async () => {
      const customHeaders = new Headers({ "X-Custom": "value" });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      await httpClient.get("/api/test", { headers: customHeaders });

      const actualRequestCall = mockFetch.mock.calls[1];
      const headers = actualRequestCall[1].headers;

      expect(headers.get("X-Custom")).toBe("value");
    });
  });

  describe("Response Parsing", () => {
    test("should parse JSON responses correctly", async () => {
      const mockResponse = { id: 1, name: "test", items: [1, 2, 3] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await httpClient.get("/api/test");

      expect(result).toEqual(mockResponse);
    });

    test("getProducts should handle paginated responses", async () => {
      const mockProducts = [{ id: 1 }, { id: 2 }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: mockProducts, count: 2 }),
        });

      const result = await httpClient.getProducts("/api/products");

      expect(result).toEqual(mockProducts);
    });

    test("getProducts should handle direct array responses", async () => {
      const mockProducts = [{ id: 1 }, { id: 2 }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ csrfToken: "csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProducts,
        });

      const result = await httpClient.getProducts("/api/products");

      expect(result).toEqual(mockProducts);
    });
  });

  // ---------------------------------------------------------------------------
  // Session-safety regression tests (F7/F8): refresh outcomes are classified as
  // ok / rejected / transient and ONLY "rejected" may clear local auth state.
  // ---------------------------------------------------------------------------

  type MockRes = {
    ok: boolean;
    status: number;
    statusText: string;
    headers: { get: (name: string) => string | null };
    json: () => Promise<unknown>;
  };

  function mockRes(
    status: number,
    body: unknown = {},
    headers: Record<string, string> = {}
  ): MockRes {
    const lower: Record<string, string> = {};
    Object.entries(headers).forEach(([k, v]) => {
      lower[k.toLowerCase()] = v;
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  }

  const csrfOk = (token = "csrf-token") => mockRes(200, { csrfToken: token });
  const abortError = () =>
    Object.assign(new Error("The operation was aborted."), {
      name: "AbortError",
    });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Await a promise that must reject and return the (typed) error. */
  const caught = (promise: Promise<unknown>): Promise<HttpError> =>
    promise.then(
      () => {
        throw new Error("expected the promise to reject");
      },
      (error: unknown) => error as HttpError
    );

  describe("refreshAuthTokensDetailed outcomes", () => {
    beforeEach(() => {
      setAccessToken("access-old");
      localStorageData["user"] = '{"id":1}';
      localStorageData["wishlist"] = "[1]";
      localStorageData["guest_wishlist"] = "[2]";
    });

    const expectSessionUntouched = () => {
      expect(sessionStorageData["authToken"]).toBe("access-old");
      expect(localStorageData["user"]).toBe('{"id":1}');
      expect(localStorageData["wishlist"]).toBe("[1]");
      expect(localStorageData["guest_wishlist"]).toBe("[2]");
      expect(mockDispatchEvent).not.toHaveBeenCalled();
    };

    test("2xx with an access token is ok and stores the token", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockResolvedValueOnce(mockRes(200, { access: "access-new" }));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("ok");

      expect(sessionStorageData["authToken"]).toBe("access-new");
      expect(localStorageData["user"]).toBe('{"id":1}');
    });

    test.each([
      ["500", () => mockRes(500, { error: "boom" })],
      ["502 (proxy during deploy)", () => mockRes(502, {})],
      ["503 (deploy blip)", () => mockRes(503, { detail: "unavailable" })],
      [
        "429 (throttled)",
        () => mockRes(429, { detail: "slow down" }, { "Retry-After": "30" }),
      ],
      ["404 (unexpected)", () => mockRes(404, {})],
    ])("%s is transient and does NOT clear the session", async (_name, make) => {
      mockFetch.mockResolvedValueOnce(csrfOk()).mockResolvedValueOnce(make());

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expectSessionUntouched();
    });

    test("network error (Safari 'Load failed') is transient", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockRejectedValueOnce(new TypeError("Load failed"));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expectSessionUntouched();
    });

    test("timeout is transient", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockRejectedValueOnce(abortError());

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expectSessionUntouched();
    });

    test("failing to fetch the CSRF token (network) is transient", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expectSessionUntouched();
    });

    test("CSRF endpoint answering 200 without a token is transient (no refresh POST, no clearing)", async () => {
      mockFetch.mockResolvedValueOnce(mockRes(200, {}));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expectSessionUntouched();
    });

    test("CSRF endpoint 503 is transient", async () => {
      mockFetch.mockResolvedValueOnce(mockRes(503, {}));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expectSessionUntouched();
    });

    test.each([
      ["no access field", () => mockRes(200, {})],
      ["non-string access", () => mockRes(200, { access: 123 })],
      [
        "unparseable body (proxy HTML)",
        () => ({
          ...mockRes(200),
          json: async () => {
            throw new SyntaxError("Unexpected token '<'");
          },
        }),
      ],
    ])("malformed 2xx body (%s) is transient", async (_name, make) => {
      mockFetch.mockResolvedValueOnce(csrfOk()).mockResolvedValueOnce(make());

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

      expectSessionUntouched();
    });

    test("401 is rejected and clears the local session", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockResolvedValueOnce(mockRes(401, { detail: "Token is blacklisted" }));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("rejected");

      expect(sessionStorageData["authToken"]).toBeUndefined();
      expect(localStorageData["user"]).toBeUndefined();
      expect(localStorageData["wishlist"]).toBeUndefined();
      expect(localStorageData["guest_wishlist"]).toBeUndefined();
    });

    test("refreshAuthTokens stays boolean: true only for ok", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockResolvedValueOnce(mockRes(503, {}));
      await expect(refreshAuthTokens()).resolves.toBe(false);

      mockFetch.mockResolvedValueOnce(mockRes(200, { access: "access-new" }));
      await expect(refreshAuthTokens()).resolves.toBe(true);

      mockFetch.mockResolvedValueOnce(mockRes(401, {}));
      await expect(refreshAuthTokens()).resolves.toBe(false);
    });

    test("403 resets the CSRF token, fetches a new one and retries ONCE", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-stale"))
        .mockResolvedValueOnce(mockRes(403, { detail: "CSRF Failed: token incorrect" }))
        .mockResolvedValueOnce(csrfOk("tok-fresh"))
        .mockResolvedValueOnce(mockRes(200, { access: "access-new" }));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("ok");

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockFetch.mock.calls[0][0]).toBe(CSRF_TOKEN_URL);
      expect(mockFetch.mock.calls[1][0]).toBe(TOKEN_REFRESH_URL);
      expect(mockFetch.mock.calls[1][1].headers["X-CSRFToken"]).toBe("tok-stale");
      expect(mockFetch.mock.calls[2][0]).toBe(CSRF_TOKEN_URL);
      expect(mockFetch.mock.calls[3][0]).toBe(TOKEN_REFRESH_URL);
      expect(mockFetch.mock.calls[3][1].headers["X-CSRFToken"]).toBe("tok-fresh");
      expect(sessionStorageData["authToken"]).toBe("access-new");
      expect(mockReport).toHaveBeenCalledWith(
        expect.objectContaining({ op: "refresh", stage: "csrf", status: 403 })
      );
    });

    test("a stale cached CSRF token no longer poisons every later refresh", async () => {
      // Token cached by an earlier request...
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-old"))
        .mockResolvedValueOnce(mockRes(200, { ok: true }));
      await httpClient.get("/api/test");
      mockFetch.mockReset();

      // ...cookie changed server-side: first refresh 403s, then heals itself.
      mockFetch
        .mockResolvedValueOnce(mockRes(403, { detail: "CSRF Failed: bad token" }))
        .mockResolvedValueOnce(csrfOk("tok-new"))
        .mockResolvedValueOnce(mockRes(200, { access: "access-new" }));
      await expect(refreshAuthTokensDetailed()).resolves.toBe("ok");

      // The next refresh reuses the healed token (no extra CSRF fetch).
      mockFetch.mockResolvedValueOnce(mockRes(200, { access: "access-newer" }));
      await expect(refreshAuthTokensDetailed()).resolves.toBe("ok");
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockFetch.mock.calls[3][1].headers["X-CSRFToken"]).toBe("tok-new");
    });

    test("403 twice in a row is final: rejected and cleared", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-1"))
        .mockResolvedValueOnce(mockRes(403, { detail: "CSRF Failed" }))
        .mockResolvedValueOnce(csrfOk("tok-2"))
        .mockResolvedValueOnce(mockRes(403, { detail: "CSRF Failed" }));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("rejected");

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(sessionStorageData["authToken"]).toBeUndefined();
      expect(localStorageData["user"]).toBeUndefined();
    });

    test.each([
      ["a Cloudflare/WAF challenge (HTML body)", () => mockRes(403, {})],
      ["a JSON 403 that is not about CSRF", () => mockRes(403, { detail: "Forbidden by policy" })],
    ])(
      "a 403 that is NOT a CSRF failure (%s) is transient: no retry, session kept",
      async (_label, response) => {
        setAccessToken("keep-me");
        localStorageData["user"] = '{"id":1}';
        mockFetch
          .mockResolvedValueOnce(csrfOk("tok-1"))
          .mockResolvedValueOnce(response());

        await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");

        expect(mockFetch).toHaveBeenCalledTimes(2); // csrf fetch + ONE refresh, no CSRF retry
        expect(sessionStorageData["authToken"]).toBe("keep-me");
        expect(localStorageData["user"]).toBe('{"id":1}');
      }
    );

    test("concurrent callers share ONE network refresh and the same outcome (ok)", async () => {
      const refreshResponse = deferred<MockRes>();
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockImplementationOnce(() => refreshResponse.promise);

      const results = [
        refreshAuthTokensDetailed(),
        refreshAuthTokensDetailed(),
        refreshAuthTokensDetailed(),
      ];
      await tick();
      refreshResponse.resolve(mockRes(200, { access: "access-new" }));

      await expect(Promise.all(results)).resolves.toEqual(["ok", "ok", "ok"]);
      // one CSRF fetch + one refresh POST for all three callers
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("queued waiters receive the same transient / rejected outcome", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockResolvedValueOnce(mockRes(503, {}));
      await expect(
        Promise.all([refreshAuthTokensDetailed(), refreshAuthTokensDetailed()])
      ).resolves.toEqual(["transient", "transient"]);
      expectSessionUntouched();

      mockFetch.mockResolvedValueOnce(mockRes(401, {}));
      await expect(
        Promise.all([refreshAuthTokensDetailed(), refreshAuthTokensDetailed()])
      ).resolves.toEqual(["rejected", "rejected"]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("a refresh can be started again after a completed one (no stuck in-flight state)", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockRejectedValueOnce(new TypeError("Load failed"))
        .mockResolvedValueOnce(mockRes(200, { access: "access-new" }));

      await expect(refreshAuthTokensDetailed()).resolves.toBe("transient");
      await expect(refreshAuthTokensDetailed()).resolves.toBe("ok");
    });

    test("a login that completes mid-flight is not clobbered by a stale REJECTED refresh", async () => {
      const refreshResponse = deferred<MockRes>();
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockImplementationOnce(() => refreshResponse.promise);

      const pending = refreshAuthTokensDetailed();
      await tick();
      setAccessToken("access-new-login"); // user signs in while the old refresh is in flight
      refreshResponse.resolve(mockRes(401, { detail: "old cookie" }));

      await expect(pending).resolves.toBe("rejected");
      expect(sessionStorageData["authToken"]).toBe("access-new-login");
      expect(localStorageData["user"]).toBe('{"id":1}');
    });

    test("a login that completes mid-flight is not overwritten by a stale OK refresh", async () => {
      const refreshResponse = deferred<MockRes>();
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockImplementationOnce(() => refreshResponse.promise);

      const pending = refreshAuthTokensDetailed();
      await tick();
      setAccessToken("access-new-login");
      refreshResponse.resolve(mockRes(200, { access: "access-from-old-cookie" }));

      await expect(pending).resolves.toBe("ok");
      expect(sessionStorageData["authToken"]).toBe("access-new-login");
    });

    describe("telemetry", () => {
      test("transient outcomes are reported (with status / error name)", async () => {
        mockFetch
          .mockResolvedValueOnce(csrfOk())
          .mockResolvedValueOnce(mockRes(503, {}, { "X-Request-ID": "req-abcdef12" }));
        await refreshAuthTokensDetailed();

        expect(mockReport).toHaveBeenCalledWith(
          expect.objectContaining({
            op: "refresh",
            stage: "refresh_transient",
            status: 503,
            requestId: "req-abcdef12",
          })
        );

        mockReport.mockClear();
        mockFetch.mockRejectedValueOnce(new TypeError("Load failed"));
        await refreshAuthTokensDetailed();
        expect(mockReport).toHaveBeenCalledWith(
          expect.objectContaining({
            op: "refresh",
            stage: "refresh_transient",
            status: null,
            error: expect.any(TypeError),
          })
        );
      });

      test("rejected is reported when a session existed", async () => {
        mockFetch
          .mockResolvedValueOnce(csrfOk())
          .mockResolvedValueOnce(mockRes(401, {}));
        await refreshAuthTokensDetailed();

        expect(mockReport).toHaveBeenCalledWith(
          expect.objectContaining({
            op: "refresh",
            stage: "refresh_rejected",
            status: 401,
          })
        );
      });

      test("rejected anonymous cookie probe is NOT reported (normal outcome)", async () => {
        clearAccessToken();
        delete localStorageData["user"];
        mockFetch
          .mockResolvedValueOnce(csrfOk())
          .mockResolvedValueOnce(mockRes(401, {}));

        await expect(refreshAuthTokensDetailed()).resolves.toBe("rejected");

        expect(mockReport).not.toHaveBeenCalled();
      });

      test("ok is not reported", async () => {
        mockFetch
          .mockResolvedValueOnce(csrfOk())
          .mockResolvedValueOnce(mockRes(200, { access: "a" }));
        await refreshAuthTokensDetailed();
        expect(mockReport).not.toHaveBeenCalled();
      });
    });
  });

  describe("401 on a request", () => {
    beforeEach(() => {
      setAccessToken("expired-token");
      localStorageData["user"] = '{"id":1}';
      localStorageData["wishlist"] = "[1]";
    });

    test("refresh REJECTED -> auth:logout event + auth error", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockResolvedValueOnce(mockRes(401, { error: "expired" }))
        .mockResolvedValueOnce(mockRes(401, { detail: "Token is blacklisted" }));

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Authentication failed. Please log in again."
      );

      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "auth:logout" })
      );
      expect(sessionStorageData["authToken"]).toBeUndefined();
    });

    test.each([
      ["503", () => Promise.resolve(mockRes(503, {}))],
      ["429", () => Promise.resolve(mockRes(429, {}, { "Retry-After": "5" }))],
      ["network error", () => Promise.reject(new TypeError("Load failed"))],
      ["timeout", () => Promise.reject(abortError())],
    ])(
      "refresh TRANSIENT (%s) -> no auth:logout, session kept, network-flagged error",
      async (_name, refreshResult) => {
        mockFetch
          .mockResolvedValueOnce(csrfOk())
          .mockResolvedValueOnce(mockRes(401, { error: "expired" }))
          .mockImplementationOnce(refreshResult);

        const error = await caught(httpClient.get("/api/test"));

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe(
          "Network error. Please check your connection and try again."
        );
        expect(error.isNetworkError).toBe(true);
        expect(mockDispatchEvent).not.toHaveBeenCalled();
        expect(sessionStorageData["authToken"]).toBe("expired-token");
        expect(localStorageData["user"]).toBe('{"id":1}');
        expect(localStorageData["wishlist"]).toBe("[1]");
      }
    );

    test("does not announce logout when a newer login replaced the session mid-refresh", async () => {
      const refreshResponse = deferred<MockRes>();
      mockFetch
        .mockResolvedValueOnce(csrfOk())
        .mockResolvedValueOnce(mockRes(401, { error: "expired" }))
        .mockImplementationOnce(() => refreshResponse.promise);

      const request = caught(httpClient.get("/api/test"));
      await tick();
      setAccessToken("brand-new-login");
      refreshResponse.resolve(mockRes(401, { detail: "old cookie" }));

      const error = await request;
      expect(error.message).toBe("Authentication failed. Please log in again.");
      expect(mockDispatchEvent).not.toHaveBeenCalled();
      expect(sessionStorageData["authToken"]).toBe("brand-new-login");
    });
  });

  describe("error metadata (request id, Retry-After, network/timeout flags)", () => {
    test("HTTP errors carry response.{data,status,requestId,retryAfter}; headers win over body", async () => {
      const body = {
        error: "Too many attempts. Try again later.",
        code: "rate_limited",
        request_id: "body-req-id-0001",
        retry_after: 12,
      };
      mockFetch.mockResolvedValueOnce(
        mockRes(429, body, { "X-Request-ID": "hdr-req-id-0001", "Retry-After": "30" })
      );

      const error = await caught(httpClient
        .post("/api/auth/login/", { email: "a@b.co" }, { skipAuth: true, skipCSRF: true }));

      expect(error.message).toBe("Too many attempts. Try again later.");
      expect(error.response).toEqual({
        data: body,
        status: 429,
        requestId: "hdr-req-id-0001",
        retryAfter: 30,
      });
      expect(error.isNetworkError).toBeUndefined();
      expect(error.isTimeout).toBeUndefined();
    });

    test("falls back to body request_id / retry_after when headers are absent", async () => {
      mockFetch.mockResolvedValueOnce(
        mockRes(429, { error: "Slow down", request_id: "body-req-id-0002", retry_after: "12" })
      );

      const error = await caught(httpClient
        .get("/api/test", { skipCSRF: true }));

      expect(error.response?.requestId).toBe("body-req-id-0002");
      expect(error.response?.retryAfter).toBe(12);
    });

    test("Retry-After as an HTTP date becomes seconds", async () => {
      const inThirtySeconds = new Date(Date.now() + 30_000).toUTCString();
      mockFetch.mockResolvedValueOnce(
        mockRes(503, {}, { "Retry-After": inThirtySeconds })
      );

      const error = await caught(httpClient.get("/api/test", { skipCSRF: true }));

      expect(error.response?.retryAfter).toBeGreaterThanOrEqual(28);
      expect(error.response?.retryAfter).toBeLessThanOrEqual(30);
    });

    test("responses without those fields keep the original { data, status } shape", async () => {
      mockFetch.mockResolvedValueOnce(mockRes(400, { error: "Invalid data" }));

      const error = await caught(httpClient.get("/api/test", { skipCSRF: true }));

      expect(error.message).toBe("Invalid data");
      expect(error.response).toEqual({ data: { error: "Invalid data" }, status: 400 });
      expect(error.response?.requestId).toBeUndefined();
      expect(error.response?.retryAfter).toBeUndefined();
    });

    test("a rejected fetch is flagged isNetworkError and stays recognisable", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Load failed"));

      const error = await caught(httpClient.get("/api/test", { skipCSRF: true }));

      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toBe("Load failed");
      expect(error.isNetworkError).toBe(true);
      expect(error.isTimeout).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    test("a plain Error from fetch is flagged as a network error too", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      const error = await caught(httpClient.get("/api/test", { skipCSRF: true }));

      expect(error.message).toBe("Network failure");
      expect(error.isNetworkError).toBe(true);
    });

    test("a timeout is flagged isTimeout (FetchTimeoutError) and not isNetworkError", async () => {
      mockFetch.mockRejectedValueOnce(abortError());

      const error = await caught(httpClient
        .get("/api/test", { skipCSRF: true, timeoutMs: 5000 }));

      expect(error.name).toBe("FetchTimeoutError");
      expect(error.message).toBe("Request timed out");
      expect(error.isTimeout).toBe(true);
      expect(error.isNetworkError).toBeUndefined();
    });

    test("a caller-initiated abort is passed through unflagged", async () => {
      const controller = new AbortController();
      controller.abort();
      mockFetch.mockRejectedValueOnce(abortError());

      const error = await caught(httpClient
        .get("/api/test", { skipCSRF: true, timeoutMs: 5000, signal: controller.signal }));

      expect(error.name).toBe("AbortError");
      expect(error.isNetworkError).toBeUndefined();
      expect(error.isTimeout).toBeUndefined();
    });

    test("CSRF token endpoint failures keep their message and expose the response", async () => {
      mockFetch.mockResolvedValueOnce(
        mockRes(429, { detail: "throttled" }, { "Retry-After": "7" })
      );

      const error = await caught(httpClient.get("/api/test"));

      expect(error.message).toBe("Failed to fetch CSRF token");
      expect(error.response?.status).toBe(429);
      expect(error.response?.retryAfter).toBe(7);
      expect(error.isNetworkError).toBeUndefined();
    });

    test("a network failure while fetching the CSRF token is flagged", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const error = await caught(httpClient.get("/api/test"));

      expect(error.isNetworkError).toBe(true);
    });
  });

  describe("CSRF token reset", () => {
    test("a 403 CSRF failure resets the cached token (and does not retry / loop)", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-1"))
        .mockResolvedValueOnce(
          mockRes(403, { detail: "CSRF Failed: CSRF token missing." })
        );

      await expect(httpClient.post("/api/test", {})).rejects.toThrow("CSRF Failed");
      expect(mockFetch).toHaveBeenCalledTimes(2); // no automatic retry

      // Next request fetches a fresh token instead of re-sending the stale one.
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-2"))
        .mockResolvedValueOnce(mockRes(200, { ok: true }));
      await httpClient.post("/api/test", {});

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockFetch.mock.calls[2][0]).toBe(CSRF_TOKEN_URL);
      expect(mockFetch.mock.calls[3][1].headers.get("X-CSRFToken")).toBe("tok-2");
    });

    test("a 403 that is not about CSRF keeps the cached token", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-1"))
        .mockResolvedValueOnce(mockRes(403, { detail: "You do not have permission." }));
      await expect(httpClient.get("/api/test")).rejects.toThrow("permission");

      mockFetch.mockResolvedValueOnce(mockRes(200, { ok: true }));
      await httpClient.get("/api/test");

      expect(mockFetch).toHaveBeenCalledTimes(3); // no second CSRF fetch
    });

    test("resetCSRFToken forces the next request to fetch a new token", async () => {
      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-1"))
        .mockResolvedValueOnce(mockRes(200, {}));
      await httpClient.get("/api/test");

      resetCSRFToken();

      mockFetch
        .mockResolvedValueOnce(csrfOk("tok-2"))
        .mockResolvedValueOnce(mockRes(200, {}));
      await httpClient.get("/api/test");

      expect(mockFetch.mock.calls[2][0]).toBe(CSRF_TOKEN_URL);
      expect(mockFetch.mock.calls[3][1].headers.get("X-CSRFToken")).toBe("tok-2");
    });
  });

  describe("auth failure telemetry", () => {
    const authCall = (path: string) =>
      httpClient.post(path, { email: "a@b.co" }, { skipAuth: true, skipCSRF: true });

    test("429 on an auth endpoint is reported with request id and path", async () => {
      mockFetch.mockResolvedValueOnce(
        mockRes(429, { error: "slow" }, { "X-Request-ID": "req-rate-limit-1" })
      );
      await authCall("/api/auth/login/").catch(() => undefined);

      expect(mockReport).toHaveBeenCalledTimes(1);
      expect(mockReport).toHaveBeenCalledWith({
        op: "login",
        stage: "http",
        status: 429,
        requestId: "req-rate-limit-1",
        path: "/api/auth/login/",
      });
    });

    test.each([
      ["/api/auth/register/", "register"],
      ["/api/auth/verify-email/", "verify"],
      ["/api/auth/resend-verification/", "resend"],
      ["/api/auth/password-reset/confirm/", "reset"],
    ])("5xx on %s is reported as op %s", async (path, op) => {
      mockFetch.mockResolvedValueOnce(mockRes(500, {}));
      await authCall(path).catch(() => undefined);

      expect(mockReport).toHaveBeenCalledWith(
        expect.objectContaining({ op, stage: "http", status: 500, path })
      );
    });

    test("network error and timeout on an auth endpoint are reported", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Load failed"));
      await authCall("/api/auth/login/").catch(() => undefined);
      expect(mockReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: "login",
          stage: "network",
          error: expect.any(TypeError),
        })
      );

      mockFetch.mockRejectedValueOnce(abortError());
      await httpClient
        .post("/api/auth/login/", {}, { skipAuth: true, skipCSRF: true, timeoutMs: 1000 })
        .catch(() => undefined);
      expect(mockReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ op: "login", stage: "timeout" })
      );
    });

    test("ordinary client errors (400/401) and non-auth paths are NOT reported", async () => {
      mockFetch.mockResolvedValueOnce(mockRes(401, { code: "invalid_password" }));
      await authCall("/api/auth/login/").catch(() => undefined);
      mockFetch.mockResolvedValueOnce(mockRes(400, { code: "validation_error" }));
      await authCall("/api/auth/register/").catch(() => undefined);
      mockFetch.mockResolvedValueOnce(mockRes(500, {}));
      await httpClient.get("/api/products/", { skipCSRF: true }).catch(() => undefined);
      mockFetch.mockRejectedValueOnce(new TypeError("Load failed"));
      await httpClient.get("/api/products/", { skipCSRF: true }).catch(() => undefined);

      expect(mockReport).not.toHaveBeenCalled();
    });

    test("a CSRF 403 on an auth endpoint is reported as stage csrf", async () => {
      mockFetch.mockResolvedValueOnce(mockRes(403, { detail: "CSRF Failed: bad" }));
      await authCall("/api/auth/resend-verification/").catch(() => undefined);

      expect(mockReport).toHaveBeenCalledWith(
        expect.objectContaining({ op: "resend", stage: "csrf", status: 403 })
      );
    });

    test("a 2xx body that cannot be parsed is reported as stage parse", async () => {
      mockFetch.mockResolvedValueOnce({
        ...mockRes(200),
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      });
      await authCall("/api/auth/login/").catch(() => undefined);

      expect(mockReport).toHaveBeenCalledWith(
        expect.objectContaining({ op: "login", stage: "parse", status: 200 })
      );
    });
  });
});
