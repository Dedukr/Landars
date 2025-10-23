/**
 * Professional HTTP Client with Automatic Token Refresh
 *
 * This module provides a robust HTTP client that automatically handles:
 * - JWT token refresh on expiration
 * - Request retry logic
 * - CSRF token management
 * - Error handling and user feedback
 */

// API configuration - use NEXT_PUBLIC_API_BASE_URL directly
const getApiBaseUrl = () => {
  // Use NEXT_PUBLIC_API_BASE_URL if available, otherwise fallback to https://localhost
  return process.env.NEXT_PUBLIC_API_BASE_URL || "https://localhost";
};

const API_BASE_URL = getApiBaseUrl();

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
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token/`, {
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
 * Attempt to refresh the JWT token
 */
async function refreshJWTToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refreshToken");

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken || (await fetchCSRFToken()),
      },
      credentials: "include",
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (response.ok) {
      const data: RefreshTokenResponse = await response.json();

      // Update the access token in localStorage
      localStorage.setItem("authToken", data.access);

      // Update refresh token if provided (token rotation)
      if (data.refresh) {
        localStorage.setItem("refreshToken", data.refresh);
      }

      // Token refresh successful

      return true;
    } else {
      // Refresh failed, clear tokens
      localStorage.removeItem("authToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      localStorage.removeItem("wishlist");

      // Token refresh failed

      return false;
    }
  } catch (error) {
    console.error("Token refresh error:", error);
    // Clear tokens on error
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("wishlist");

    // Token refresh failed

    return false;
  }
}

/**
 * Handle token refresh with queue management
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
 * Check if an error response indicates token expiration
 */
function isTokenExpired(response: Response): boolean {
  return response.status === 401;
}

/**
 * Get current auth token from localStorage
 */
function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("authToken");
}

/**
 * Professional HTTP Client with automatic token refresh
 */
export class HttpClient {
  private baseURL: string;

  constructor(baseURL: string = "") {
    this.baseURL = baseURL;
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
    const response = await fetch(this.baseURL + url, {
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
        errorData.error || `HTTP ${response.status}: ${response.statusText}`
      ) as Error & { response?: { data: unknown; status: number } };
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
export const httpClient = new HttpClient(API_BASE_URL);

// Export the class for custom instances
export default HttpClient;
