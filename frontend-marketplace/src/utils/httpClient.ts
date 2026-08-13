/**
 * Professional HTTP Client with Automatic Token Refresh
 *
 * This module provides a robust HTTP client that automatically handles:
 * - JWT token refresh on expiration
 * - Request retry logic
 * - CSRF token management
 * - Error handling and user feedback
 */

import { getClientApiBaseUrl } from "@/config/api";
import {
  clearAccessToken,
  clearLegacyTokenStorage,
  getAccessToken,
  setAccessToken,
} from "@/utils/authTokenStore";

// Types for the HTTP client
interface RequestConfig extends RequestInit {
  skipAuth?: boolean;
  skipCSRF?: boolean;
  retryCount?: number;
  maxRetries?: number;
}

interface RefreshTokenResponse {
  access: string;
  refresh?: string;
}

// Global state for token refresh
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let failedQueue: Array<{
  resolve: (value: boolean) => void;
  reject: (error: unknown) => void;
}> = [];

// CSRF token management
let csrfToken: string | null = null;

/**
 * Fetch CSRF token from the backend
 */
async function fetchCSRFToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetch(`${getClientApiBaseUrl()}/api/auth/csrf-token/`, {
      method: "GET",
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      csrfToken = data.csrfToken;
      return csrfToken || "";
    } else {
      throw new Error("Failed to fetch CSRF token");
    }
  } catch (error) {
    console.error("Error fetching CSRF token:", error);
    throw error;
  }
}

/**
 * Get CSRF token from cookie (fallback method)
 */
function getCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const name = "csrftoken";
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

/**
 * Reset CSRF token (useful when token expires)
 */
export function resetCSRFToken(): void {
  csrfToken = null;
}

/**
 * Process the failed request queue after token refresh
 */
function processQueue(error: unknown, success: boolean = false) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(success);
    }
  });

  failedQueue = [];
}

/**
 * Clear auth markers after a failed refresh.
 * Wishlist keys are only cleared when a prior access token existed so a
 * cookie-only probe for anonymous visitors does not wipe guest wishlist.
 */
function clearAuthAfterFailedRefresh(hadAccessToken: boolean): void {
  clearAccessToken();
  clearLegacyTokenStorage();
  localStorage.removeItem("user");
  if (hadAccessToken) {
    localStorage.removeItem("wishlist");
    localStorage.removeItem("guest_wishlist");
  }
}

/**
 * Attempt to refresh the access JWT via httpOnly refresh cookie.
 */
async function refreshJWTToken(): Promise<boolean> {
  const hadAccessToken = Boolean(getAccessToken());

  try {
    const response = await fetch(`${getClientApiBaseUrl()}/api/auth/token/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken || (await fetchCSRFToken()),
      },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data: RefreshTokenResponse = await response.json();
      setAccessToken(data.access);
      clearLegacyTokenStorage();
      return true;
    }

    clearAuthAfterFailedRefresh(hadAccessToken);
    return false;
  } catch (error) {
    console.error("Token refresh error:", error);
    clearAuthAfterFailedRefresh(hadAccessToken);
    return false;
  }
}

/**
 * Handle token refresh with queue management.
 * Concurrent callers wait for the in-flight refresh and receive the same result
 * (never a spurious false from "already refreshing").
 */
async function handleTokenRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // If already refreshing, wait for the existing promise
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  refreshPromise = refreshJWTToken();

  try {
    const success = await refreshPromise;
    processQueue(null, success);
    return success;
  } catch (error) {
    processQueue(error, false);
    return false;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Shared single-flight JWT refresh for AuthContext and HTTP 401 retry.
 * Uses httpOnly refresh cookie; updates in-memory / sessionStorage access token.
 */
export function refreshAuthTokens(): Promise<boolean> {
  return handleTokenRefresh();
}

/**
 * Check if an error response indicates token expiration
 */
function isTokenExpired(response: Response): boolean {
  return response.status === 401;
}

/**
 * Get current access token (memory / sessionStorage; not localStorage).
 */
function getAuthToken(): string | null {
  return getAccessToken();
}

/**
 * Normalize DRF / custom API error payloads into a readable string.
 * Handles ``{error: string|string[]}``, ``{detail: ...}``, and field maps.
 */
function formatApiErrorMessage(
  errorData: unknown,
  status: number,
  statusText = ""
): string {
  if (!errorData || typeof errorData !== "object") {
    return `HTTP ${status}${statusText ? `: ${statusText}` : ""}`;
  }

  const data = errorData as Record<string, unknown>;

  const fromValue = (value: unknown): string | null => {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const parts = value
        .map((item) => (typeof item === "string" ? item : null))
        .filter((item): item is string => Boolean(item));
      return parts.length ? parts.join(" ") : null;
    }
    return null;
  };

  const primary =
    fromValue(data.error) ||
    fromValue(data.detail) ||
    fromValue(data.message);
  if (primary) return primary;

  const fieldMessages: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "error" || key === "detail" || key === "message") continue;
    const msg = fromValue(value);
    if (msg) fieldMessages.push(`${key}: ${msg}`);
  }
  if (fieldMessages.length) return fieldMessages.join(" ");

  return `HTTP ${status}${statusText ? `: ${statusText}` : ""}`;
}

/**
 * Professional HTTP Client with automatic token refresh
 */
export class HttpClient {
  private baseURL: string;

  constructor(baseURL: string = "") {
    this.baseURL = baseURL;
  }

  private resolveBaseURL(): string {
    return this.baseURL || getClientApiBaseUrl();
  }

  /**
   * Make an HTTP request with automatic token refresh
   */
  async request<T = unknown>(
    url: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const {
      skipAuth = false,
      skipCSRF = false,
      retryCount = 0,
      maxRetries = 1,
      ...requestConfig
    } = config;

    // Prepare headers
    const headers = new Headers(requestConfig.headers);

    // Add CSRF token if not skipped
    if (!skipCSRF) {
      let token = csrfToken || getCSRFTokenFromCookie();
      if (!token) {
        token = await fetchCSRFToken();
      }
      headers.set("X-CSRFToken", token);
    }

    // Add Content-Type if not already set
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    // Add JWT token if not skipped and available
    if (!skipAuth) {
      const authToken = getAuthToken();
      if (authToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${authToken}`);
      }
    } else {
      // Remove any existing Authorization header when skipAuth is true
      headers.delete("Authorization");
    }

    // Make the request
    const response = await fetch(this.resolveBaseURL() + url, {
      ...requestConfig,
      headers,
      credentials: "include",
    });

    // Handle token expiration
    if (!skipAuth && isTokenExpired(response) && retryCount < maxRetries) {
      console.log("Token expired, attempting refresh...");

      const refreshSuccess = await handleTokenRefresh();

      if (refreshSuccess) {
        // Retry the original request with new token
        const newAuthToken = getAuthToken();
        if (newAuthToken) {
          headers.set("Authorization", `Bearer ${newAuthToken}`);

          return this.request<T>(url, {
            ...config,
            retryCount: retryCount + 1,
            headers,
          });
        }
      } else {
        // Refresh failed, trigger logout
        this.triggerLogout();
        throw new Error("Authentication failed. Please log in again.");
      }
    }

    // Handle other HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(
        formatApiErrorMessage(errorData, response.status, response.statusText)
      ) as Error & {
        response?: { data: unknown; status: number };
      };
      // Preserve the full response data for error handling
      error.response = {
        data: errorData,
        status: response.status,
      };
      throw error;
    }

    // Return parsed JSON response
    return response.json();
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    url: string,
    config: Omit<RequestConfig, "method" | "body"> = {}
  ): Promise<T> {
    return this.request<T>(url, { ...config, method: "GET" });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    config: Omit<RequestConfig, "method"> = {}
  ): Promise<T> {
    return this.request<T>(url, {
      ...config,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    config: Omit<RequestConfig, "method"> = {}
  ): Promise<T> {
    return this.request<T>(url, {
      ...config,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config: Omit<RequestConfig, "method"> = {}
  ): Promise<T> {
    return this.request<T>(url, {
      ...config,
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    url: string,
    config: Omit<RequestConfig, "method" | "body"> = {}
  ): Promise<T> {
    return this.request<T>(url, { ...config, method: "DELETE" });
  }

  /**
   * Get products with pagination support
   * Returns the results array from paginated response or the response itself if not paginated
   */
  async getProducts<T = unknown>(
    url: string,
    config: Omit<RequestConfig, "method" | "body"> = {}
  ): Promise<T[]> {
    const response = await this.get<
      { results?: T[] } & Record<string, unknown>
    >(url, config);

    // Handle paginated response structure
    if (response && typeof response === "object" && "results" in response) {
      return Array.isArray(response.results) ? response.results : [];
    }

    // Handle direct array response
    if (Array.isArray(response)) {
      return response;
    }

    // Handle single object response (wrap in array)
    if (response && typeof response === "object") {
      return [response as T];
    }

    return [];
  }

  /**
   * Trigger logout when authentication fails
   */
  private triggerLogout(): void {
    // Dispatch a custom event that AuthContext can listen to
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }
}

// Create and export a default instance
export const httpClient = new HttpClient();

// Export the class for custom instances
export default HttpClient;
