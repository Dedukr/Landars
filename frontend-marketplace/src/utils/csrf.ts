// CSRF token utility functions
// API configuration - use NEXT_PUBLIC_API_BASE_URL directly
const getApiBaseUrl = () => {
  // Use NEXT_PUBLIC_API_BASE_URL if available, otherwise fallback to https://localhost
  return process.env.NEXT_PUBLIC_API_BASE_URL || "https://localhost";
};

const API_BASE_URL = getApiBaseUrl();

let csrfToken: string | null = null;

/**
 * Fetch CSRF token from the backend
 */
export async function fetchCSRFToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/csrf-token/`, {
      method: "GET",
      credentials: "include", // Important for CSRF cookies
    });

    if (response.ok) {
      const data = await response.json();
      csrfToken = data.csrfToken;
      return csrfToken as string;
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
export function getCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") {
    return null; // SSR safety
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
 * Make an authenticated API request with CSRF token and optional JWT
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Get CSRF token
  let token = csrfToken || getCSRFTokenFromCookie();

  if (!token) {
    token = await fetchCSRFToken();
  }

  // Prepare headers
  const headers = new Headers(options.headers);
  headers.set("X-CSRFToken", token);

  // Set Content-Type if not already set
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Add JWT token from localStorage if available and not already in headers
  if (typeof window !== "undefined" && !headers.has("Authorization")) {
    const authToken = localStorage.getItem("authToken");
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
  }

  // Make request with CSRF token and JWT
  return fetch(url, {
    ...options,
    headers,
    credentials: "include", // Important for CSRF cookies
  });
}

/**
 * Reset CSRF token (useful when token expires)
 */
export function resetCSRFToken(): void {
  csrfToken = null;
}
