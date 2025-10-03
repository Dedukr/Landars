// CSRF token utility functions

let csrfToken: string | null = null;

/**
 * Fetch CSRF token from the backend
 */
export async function fetchCSRFToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    // Use the nginx proxy directly since Next.js rewrites have issues with trailing slashes
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const response = await fetch(`${baseUrl}/api/auth/csrf-token/`, {
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
 * Make an authenticated API request with CSRF token
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
  headers.set("Content-Type", "application/json");

  // Make request with CSRF token
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
