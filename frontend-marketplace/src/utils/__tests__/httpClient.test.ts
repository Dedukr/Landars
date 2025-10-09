/**
 * HTTP Client Tests
 *
 * Tests for the professional HTTP client with automatic token refresh
 */

import { httpClient } from "../httpClient";

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// No notification mocking needed

describe("HttpClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  describe("Token Refresh", () => {
    it("should automatically refresh token on 401 response", async () => {
      // Mock initial request returning 401
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Token expired" }),
        })
        // Mock token refresh request
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access: "new-access-token",
              refresh: "new-refresh-token",
            }),
        })
        // Mock retry request with new token
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "success" }),
        });

      // Mock localStorage
      localStorageMock.getItem
        .mockReturnValueOnce("csrf-token") // CSRF token
        .mockReturnValueOnce("old-access-token") // Auth token
        .mockReturnValueOnce("old-refresh-token"); // Refresh token

      const result = await httpClient.get("/api/test");

      expect(result).toEqual({ data: "success" });
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "authToken",
        "new-access-token"
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "refreshToken",
        "new-refresh-token"
      );
    });

    it("should trigger logout when token refresh fails", async () => {
      // Mock initial request returning 401
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Token expired" }),
        })
        // Mock token refresh request failing
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Refresh token expired" }),
        });

      // Mock localStorage
      localStorageMock.getItem
        .mockReturnValueOnce("csrf-token")
        .mockReturnValueOnce("old-access-token")
        .mockReturnValueOnce("old-refresh-token");

      // Mock window.dispatchEvent
      const mockDispatchEvent = jest.fn();
      Object.defineProperty(window, "dispatchEvent", {
        value: mockDispatchEvent,
      });

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Authentication failed. Please log in again."
      );

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("authToken");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("refreshToken");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("user");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("wishlist");
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        new CustomEvent("auth:logout")
      );
    });
  });

  describe("Request Methods", () => {
    beforeEach(() => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: "success" }),
      });
      localStorageMock.getItem.mockReturnValue("token");
    });

    it("should make GET requests", async () => {
      const result = await httpClient.get("/api/test");
      expect(result).toEqual({ data: "success" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("should make POST requests", async () => {
      const data = { test: "data" };
      const result = await httpClient.post("/api/test", data);
      expect(result).toEqual({ data: "success" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(data),
        })
      );
    });

    it("should make PUT requests", async () => {
      const data = { test: "data" };
      const result = await httpClient.put("/api/test", data);
      expect(result).toEqual({ data: "success" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(data),
        })
      );
    });

    it("should make PATCH requests", async () => {
      const data = { test: "data" };
      const result = await httpClient.patch("/api/test", data);
      expect(result).toEqual({ data: "success" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(data),
        })
      );
    });

    it("should make DELETE requests", async () => {
      const result = await httpClient.delete("/api/test");
      expect(result).toEqual({ data: "success" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle HTTP errors", async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: "Invalid request" }),
      });

      localStorageMock.getItem.mockReturnValue("token");

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Invalid request"
      );
    });

    it("should handle network errors", async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
      localStorageMock.getItem.mockReturnValue("token");

      await expect(httpClient.get("/api/test")).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("CSRF Token Management", () => {
    it("should include CSRF token in requests", async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: "success" }),
      });

      localStorageMock.getItem.mockReturnValue("csrf-token");

      await httpClient.get("/api/test");

      expect(fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );

      const headers = (fetch as jest.Mock).mock.calls[0][1].headers;
      expect(headers.get("X-CSRFToken")).toBe("csrf-token");
    });

    it("should fetch CSRF token if not available", async () => {
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ csrfToken: "new-csrf-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "success" }),
        });

      localStorageMock.getItem.mockReturnValue(null);

      await httpClient.get("/api/test");

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        "/api/auth/csrf-token/",
        expect.any(Object)
      );
      expect(fetch).toHaveBeenNthCalledWith(2, "/api/test", expect.any(Object));
    });
  });
});
