/**
 * In-memory access token store shared by AuthContext and httpClient.
 * Refresh lives in an httpOnly cookie (not accessible here).
 * sessionStorage holds a tab-scoped copy of the access token for reloads.
 */

const ACCESS_STORAGE_KEY = "authToken";
const LEGACY_REFRESH_KEY = "refreshToken";

let accessToken: string | null = null;

function canUseDOM(): boolean {
  return typeof window !== "undefined";
}

/** Remove long-lived JWT keys from localStorage (XSS hardening migration). */
export function clearLegacyTokenStorage(): void {
  if (!canUseDOM()) return;
  try {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  } catch {
    // ignore quota / private mode errors
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (!canUseDOM()) return null;
  try {
    const fromSession = sessionStorage.getItem(ACCESS_STORAGE_KEY);
    if (fromSession) {
      accessToken = fromSession;
      return accessToken;
    }
  } catch {
    // ignore
  }
  return null;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (!canUseDOM()) return;
  try {
    if (token) {
      sessionStorage.setItem(ACCESS_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  // Ensure access is never left in localStorage
  try {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  } catch {
    // ignore
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}
