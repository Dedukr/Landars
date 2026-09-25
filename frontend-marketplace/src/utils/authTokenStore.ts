/**
 * In-memory access token store shared by AuthContext and httpClient.
 * Refresh lives in an httpOnly cookie (not accessible here).
 * sessionStorage holds a tab-scoped copy of the access token for reloads.
 */

const ACCESS_STORAGE_KEY = "authToken";
const LEGACY_REFRESH_KEY = "refreshToken";
/** localStorage key other tabs observe via the `storage` event (sessionStorage does not cross tabs). */
export const AUTH_LOGOUT_AT_KEY = "auth:logout-at";
const AUTH_BROADCAST_CHANNEL = "foodplatform-auth";

let accessToken: string | null = null;
/** Stamp of the logout this tab just published — ignore the echo on our own listeners. */
let lastLogoutStampWeWrote: string | null = null;

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

type AuthLogoutMessage = { type: "logout"; stamp: string };

function isLogoutMessage(data: unknown): data is AuthLogoutMessage {
  if (!data || typeof data !== "object") return false;
  const record = data as { type?: unknown; stamp?: unknown };
  return record.type === "logout" && typeof record.stamp === "string";
}

function openAuthBroadcastChannel(): BroadcastChannel | null {
  if (!canUseDOM()) return null;
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    return new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
  } catch {
    return null;
  }
}

/**
 * Tell other tabs this tab ended its local session (explicit logout or REJECTED refresh).
 * BroadcastChannel is preferred; `auth:logout-at` in localStorage is the storage-event fallback.
 * Never call this on transient refresh failures.
 */
export function broadcastLocalSessionEnded(): void {
  if (!canUseDOM()) return;
  const stamp = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  lastLogoutStampWeWrote = stamp;

  const channel = openAuthBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage({ type: "logout", stamp } satisfies AuthLogoutMessage);
    } catch {
      // ignore
    }
    try {
      channel.close();
    } catch {
      // ignore
    }
  }

  try {
    localStorage.setItem(AUTH_LOGOUT_AT_KEY, stamp);
  } catch {
    // ignore quota / private mode errors
  }
}

/**
 * Subscribe to logout broadcasts from other tabs. The writer tab is ignored
 * (native `storage` events already skip the writer; the stamp covers BroadcastChannel).
 */
export function subscribeRemoteSessionEnded(onRemoteLogout: () => void): () => void {
  if (!canUseDOM()) return () => undefined;

  let coalesced = false;
  const notify = () => {
    if (coalesced) return;
    coalesced = true;
    try {
      onRemoteLogout();
    } finally {
      queueMicrotask(() => {
        coalesced = false;
      });
    }
  };

  const onBroadcast = (event: MessageEvent) => {
    if (!isLogoutMessage(event.data)) return;
    if (event.data.stamp === lastLogoutStampWeWrote) return;
    notify();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_LOGOUT_AT_KEY) return;
    if (!event.newValue) return;
    if (event.newValue === lastLogoutStampWeWrote) return;
    notify();
  };

  const channel = openAuthBroadcastChannel();
  channel?.addEventListener("message", onBroadcast);
  window.addEventListener("storage", onStorage);

  return () => {
    try {
      channel?.removeEventListener("message", onBroadcast);
      channel?.close();
    } catch {
      // ignore
    }
    window.removeEventListener("storage", onStorage);
  };
}
