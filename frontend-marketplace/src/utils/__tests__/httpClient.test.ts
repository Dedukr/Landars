/**
 * HTTP Client Tests
 *
 * Clean, professional tests for the HTTP client with automatic token refresh
 * Following Jest best practices for mocking fetch and localStorage
 */

import { httpClient, resetCSRFToken } from "../httpClient";

// Constants
const API_BASE_URL = "https://localhost";
const CSRF_TOKEN_URL = `${API_BASE_URL}/api/auth/csrf-token/`;
const TOKEN_REFRESH_URL = `${API_BASE_URL}/api/auth/token/refresh/`;
const TEST_API_URL = `${API_BASE_URL}/api/test`;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// Mock localStorage with actual storage
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: jest.fn((key: string) => storage[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete storage[key];
  }),
  clear: jest.fn(() => {
    Object.keys(storage).forEach((key) => delete storage[key]);
  }),
};

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
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

    // Clear storage
    Object.keys(storage).forEach((key) => delete storage[key]);

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
      storage["authToken"] = "test-auth-token";

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
      storage["authToken"] = "test-auth-token";

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
      // Setup: User has valid refresh token
      storage["authToken"] = "expired-token";
      storage["refreshToken"] = "valid-refresh-token";

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
        // Call 3: Token refresh succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access: "new-access-token",
            refresh: "new-refresh-token",
          }),
        })
        // Call 4: Retry request succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: "success" }),
        });

      const result = await httpClient.get("/api/test");

      // Should get the final success response
      expect(result).toEqual({ data: "success" });

      // Tokens should be updated
      expect(storage["authToken"]).toBe("new-access-token");
      expect(storage["refreshToken"]).toBe("new-refresh-token");

      // Should make 4 fetch calls total
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify the refresh call
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        TOKEN_REFRESH_URL,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refresh: "valid-refresh-token" }),
        })
      );
    });

    test("should trigger logout when refresh fails", async () => {
      storage["authToken"] = "expired-token";
      storage["refreshToken"] = "invalid-refresh-token";

      mockFetch
        // Call 1: CSRF token fetch
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
        // Call 3: Token refresh fails
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid refresh token" }),
        });

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Authentication failed. Please log in again."
      );

      // Tokens should be cleared
      expect(storage["authToken"]).toBeUndefined();
      expect(storage["refreshToken"]).toBeUndefined();
      expect(storage["user"]).toBeUndefined();
      expect(storage["wishlist"]).toBeUndefined();

      // Logout event should be dispatched
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "auth:logout" })
      );
    });

    test("should not retry when maxRetries is reached", async () => {
      storage["authToken"] = "expired-token";
      storage["refreshToken"] = "valid-refresh-token";

      mockFetch
        // Call 1: CSRF token fetch
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
        // Call 3: Token refresh succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access: "new-token",
            refresh: "new-refresh",
          }),
        })
        // Call 4: Retry also returns 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Still expired" }),
        });

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Still expired"
      );

      // Should not attempt second refresh (maxRetries = 1)
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
