/**
 * HTTP Client Tests
 *
 * Clean, professional tests for the HTTP client with automatic token refresh
 * Following Jest best practices for mocking fetch and storage
 */

import { httpClient, refreshAuthTokens, resetCSRFToken } from "../httpClient";
import { clearAccessToken, setAccessToken } from "../authTokenStore";

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
    // Clear all mocks
    jest.clearAllMocks();
    mockFetch.mockClear();

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
});
