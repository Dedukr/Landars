"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { httpClient, refreshAuthTokensDetailed } from "@/utils/httpClient";
import { clearCartStorage } from "@/utils/cartStorage";
import { clearWishlistStorage } from "@/utils/wishlistStorage";
import { getPersistedUserId } from "@/utils/persistedUser";
import { formatUserDisplayName } from "@/lib/userName";
import {
  authTokensUnchanged,
  createAuthGeneration,
  hasReplacementSession,
} from "@/utils/authSessionGuard";
import { reportAuthClientEvent } from "@/utils/authTelemetry";
import {
  broadcastLocalSessionEnded,
  clearAccessToken,
  clearLegacyTokenStorage,
  getAccessToken,
  setAccessToken,
  subscribeRemoteSessionEnded,
} from "@/utils/authTokenStore";
import {
  AUTH_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "@/utils/fetchWithTimeout";

/**
 * Self-healing restore: after a TRANSIENT failure (offline, 5xx, throttle, timeout) the
 * session is kept untouched and restore is retried a bounded number of times (delay after the
 * previous attempt). `online` / tab-visible events retry immediately (capped).
 */
const RESTORE_RETRY_DELAYS_MS = [3_000, 10_000, 30_000] as const;
const RESTORE_MAX_TRIGGERED_ATTEMPTS = 5;
/** Never keep the "Restoring your session" spinner longer than this (restore continues). */
const RESTORE_MAX_BLOCKING_MS = 12_000;
/** Explicit logout must not hang the UI on a slow backend. */
const LOGOUT_TIMEOUT_MS = AUTH_FETCH_TIMEOUT_MS;

/** Clear token-only half-session without cart/wishlist side effects. */
function clearHalfSessionAccess(): void {
  clearAccessToken();
  localStorage.removeItem("user");
}

/** Reject after `ms` so a stalled response body cannot hang restore forever. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

interface User {
  id: number;
  name: string;
  first_name?: string | null;
  surname?: string | null;
  email: string;
  is_staff?: boolean;
  can_use_festival?: boolean;
}

interface AuthTokens {
  access: string;
  /** @deprecated Refresh is httpOnly-cookie only; ignored if present. */
  refresh?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (tokens: AuthTokens, user: User) => void;
  logout: () => void;
  loading: boolean;
  refreshToken: () => Promise<boolean>;
}

/**
 * Result of validating an access token against the profile endpoint.
 * `unauthorized` = the server refused the token (401/403); `transient` = we could not tell
 * (network error, timeout, 429, 5xx, malformed body) - never a reason to drop the session.
 */
type ProfileCheck =
  | { status: "ok"; user: User }
  | { status: "unauthorized" }
  | { status: "transient"; httpStatus?: number; error?: unknown };

type StoreSyncResult = "synced" | "unauthorized" | "transient" | "stale";
type SessionRefreshResult = "ok" | "rejected" | "transient" | "stale";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Detects login/logout that completes while async restore/refresh is in flight
  const authGeneration = useRef(createAuthGeneration()).current;
  const tokenRef = useRef<string | null>(null);

  tokenRef.current = token;

  /**
   * Validates a JWT token by making a test request to the user endpoint
   * Also fetches and returns the full user profile including is_staff
   */
  const validateToken = useCallback(
    async (tokenToValidate: string): Promise<ProfileCheck> => {
      try {
        const response = await fetchWithTimeout(
          `/api/auth/profile/`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${tokenToValidate}`,
              "Content-Type": "application/json",
            },
            credentials: "include",
          },
          AUTH_FETCH_TIMEOUT_MS
        );

        if (!response.ok) {
          console.warn(
            `Token validation failed with status: ${response.status}`
          );
          if (response.status === 401 || response.status === 403) {
            return { status: "unauthorized" };
          }
          return { status: "transient", httpStatus: response.status };
        }

        const data = await withDeadline(
          response.json(),
          AUTH_FETCH_TIMEOUT_MS
        );
        if (data && data.user) {
          return {
            status: "ok",
            user: {
              id: data.user.id,
              name: formatUserDisplayName(data.user),
              first_name: data.user.first_name ?? null,
              surname: data.user.surname ?? null,
              email: data.user.email,
              is_staff: data.user.is_staff || false,
              can_use_festival: Boolean(data.user.can_use_festival),
            },
          };
        }

        // 2xx without a profile: a proxy/captive-portal page, not a verdict on the token.
        return { status: "transient", httpStatus: response.status };
      } catch (error) {
        console.error("Token validation error:", error);
        return { status: "transient", error };
      }
    },
    []
  );

  /**
   * Sync React auth state from the access-token store after a shared refresh.
   * Requires a successful profile load — a token the server refuses is cleared
   * (no token-only half-sessions); a transient failure keeps the fresh token so the
   * profile check can simply be retried.
   */
  const syncAuthStateFromStore = useCallback(
    async (generationSnapshot: number): Promise<StoreSyncResult> => {
      if (!authGeneration.isCurrent(generationSnapshot)) {
        return "stale";
      }

      const access = getAccessToken();
      if (!access) {
        return "unauthorized";
      }

      const check = await validateToken(access);
      if (!authGeneration.isCurrent(generationSnapshot)) {
        return "stale";
      }

      if (check.status === "ok") {
        setToken(access);
        setUser(check.user);
        localStorage.setItem("user", JSON.stringify(check.user));
        return "synced";
      }

      if (check.status === "unauthorized") {
        // Access exists but the server refuses it — do not leave token-only state.
        // Do not refresh again here (avoids loops); callers handle the result.
        clearHalfSessionAccess();
        setToken(null);
        setUser(null);
        return "unauthorized";
      }

      return "transient";
    },
    [authGeneration, validateToken]
  );

  /**
   * Renews the access JWT via the httpOnly refresh cookie (shared single-flight in
   * httpClient) and syncs React state. Only "rejected" means the session is over.
   */
  const refreshSession = useCallback(
    async (generationSnapshot: number): Promise<SessionRefreshResult> => {
      const accessAtStart = getAccessToken();
      const outcome = await refreshAuthTokensDetailed();

      if (!authGeneration.isCurrent(generationSnapshot)) {
        return "stale";
      }

      // A login (or another refresh) replaced the session meanwhile: adopt it.
      if (outcome === "ok" || hasReplacementSession(accessAtStart, getAccessToken)) {
        const synced = await syncAuthStateFromStore(generationSnapshot);
        if (synced === "synced") return "ok";
        if (synced === "unauthorized") return "rejected";
        return synced;
      }

      return outcome;
    },
    [authGeneration, syncAuthStateFromStore]
  );

  /**
   * Refreshes the access JWT via httpOnly cookie. Resolves true only when a new access
   * token was obtained and the profile loaded.
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      return (await refreshSession(authGeneration.snapshot())) === "ok";
    } catch (error) {
      console.error("Token refresh error:", error);
      return false;
    }
  }, [authGeneration, refreshSession]);

  /**
   * Drops the session LOCALLY (access token, cached profile, cart/wishlist caches, React
   * state) without contacting the server. Used when the server already said the session is
   * over: a server logout would blacklist the refresh cookie and could kill a session that
   * another tab just renewed.
   */
  const clearLocalSession = useCallback(
    (userIdHint?: number, options?: { broadcast?: boolean }) => {
      authGeneration.bump();
      const userId = userIdHint ?? getPersistedUserId() ?? undefined;
      clearWishlistStorage(userId);
      clearCartStorage(userId);
      clearAccessToken();
      clearLegacyTokenStorage();
      localStorage.removeItem("user");

      if (options?.broadcast !== false) {
        broadcastLocalSessionEnded();
      }

      window.dispatchEvent(new CustomEvent("user:logout"));

      setToken(null);
      setUser(null);
    },
    [authGeneration]
  );

  /**
   * Explicit user logout: asks the server to blacklist the refresh token and clear the
   * cookie (bounded by a timeout), and ALWAYS clears the local session afterwards.
   */
  const logout = useCallback(async () => {
    authGeneration.bump();
    const access = tokenRef.current || getAccessToken();
    const userId = getPersistedUserId() ?? undefined;

    try {
      await httpClient.post(
        "/api/auth/logout/",
        {},
        // skipCSRF: the endpoint needs no CSRF token; a failing /csrf-token/ must not keep the cookie alive
        { skipAuth: !access, skipCSRF: true, timeoutMs: LOGOUT_TIMEOUT_MS }
      );
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearLocalSession(userId);
    }
  }, [authGeneration, clearLocalSession]);

  /**
   * Restores auth from sessionStorage access and/or httpOnly refresh cookie.
   * When no access token exists, probes the refresh cookie once (cookie-only sessions).
   * Transient failures never touch stored auth; they schedule bounded self-healing retries
   * while `loading` is released after the FIRST attempt.
   */
  useEffect(() => {
    let cancelled = false;
    const restoreGeneration = authGeneration.snapshot();
    clearLegacyTokenStorage();

    let inFlight = false;
    let pending = false; // last attempt ended transient: healing wanted
    let timerStep = 0;
    let triggeredAttempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let loadingCap: ReturnType<typeof setTimeout> | null = null;
    let lastTransient: { status?: number; error?: unknown } = {};

    const isStale = () =>
      cancelled || !authGeneration.isCurrent(restoreGeneration);

    const releaseLoading = () => {
      if (loadingCap) {
        clearTimeout(loadingCap);
        loadingCap = null;
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    /** One restore pass. Resolves "done" (nothing more to do) or "transient" (retry later). */
    const attemptRestore = async (): Promise<"done" | "transient"> => {
      const accessAtStart = getAccessToken();
      const superseded = () =>
        isStale() || hasReplacementSession(accessAtStart, getAccessToken);

      if (accessAtStart) {
        const check = await validateToken(accessAtStart);

        if (isStale()) {
          return "done";
        }

        if (!authTokensUnchanged(accessAtStart, getAccessToken)) {
          if (hasReplacementSession(accessAtStart, getAccessToken)) {
            await syncAuthStateFromStore(restoreGeneration);
          }
          return "done";
        }

        if (check.status === "ok") {
          setToken(accessAtStart);
          setAccessToken(accessAtStart);
          setUser(check.user);
          localStorage.setItem("user", JSON.stringify(check.user));
          return "done";
        }

        if (check.status === "transient") {
          lastTransient = { status: check.httpStatus, error: check.error };
          return "transient";
        }

        // Unauthorized: the access token expired — renew it through the refresh cookie.
        const result = await refreshSession(restoreGeneration);
        if (result === "stale" || result === "ok") {
          return "done";
        }
        if (result === "rejected") {
          // Session really over (server said so): local cleanup only, no server logout.
          if (!superseded()) {
            clearLocalSession();
          }
          return "done";
        }
        lastTransient = {};
        return "transient";
      }

      // No access in this tab — probe httpOnly refresh cookie once.
      // Failure is expected when logged out; do not run full logout side effects.
      const result = await refreshSession(restoreGeneration);
      if (result === "stale" || result === "ok") {
        return "done";
      }
      if (result === "rejected") {
        if (!superseded()) {
          localStorage.removeItem("user");
        }
        return "done";
      }
      lastTransient = {};
      return "transient";
    };

    const stopHealing = () => {
      pending = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      window.removeEventListener("online", onTrigger);
      document.removeEventListener("visibilitychange", onVisible);
    };

    const scheduleRetry = () => {
      if (retryTimer || timerStep >= RESTORE_RETRY_DELAYS_MS.length) {
        return;
      }
      const delay = RESTORE_RETRY_DELAYS_MS[timerStep];
      timerStep += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void runAttempt();
      }, delay);
    };

    const runAttempt = async (): Promise<void> => {
      if (inFlight || isStale()) {
        return;
      }
      inFlight = true;
      let result: "done" | "transient";
      try {
        result = await attemptRestore();
      } catch (error) {
        // Unexpected: never destroy a session over a bug or an unknown failure.
        console.error("Error restoring auth:", error);
        lastTransient = { error };
        result = "transient";
      } finally {
        inFlight = false;
      }

      releaseLoading();

      if (isStale()) {
        stopHealing();
        return;
      }

      if (result === "transient") {
        reportAuthClientEvent({
          op: "restore",
          stage: "restore_transient",
          status: lastTransient.status ?? null,
          error: lastTransient.error,
        });
        pending = true;
        scheduleRetry();
      } else {
        stopHealing();
      }
    };

    // Retry immediately when the network is back or the tab is shown again (capped).
    const onTrigger = () => {
      if (
        !pending ||
        inFlight ||
        isStale() ||
        triggeredAttempts >= RESTORE_MAX_TRIGGERED_ATTEMPTS
      ) {
        return;
      }
      triggeredAttempts += 1;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void runAttempt();
    };
    const onVisible = () => {
      if (!document.hidden) {
        onTrigger();
      }
    };

    window.addEventListener("online", onTrigger);
    document.addEventListener("visibilitychange", onVisible);

    loadingCap = setTimeout(() => {
      loadingCap = null;
      if (!cancelled) {
        setLoading(false);
      }
    }, RESTORE_MAX_BLOCKING_MS);

    void runAttempt();

    return () => {
      cancelled = true;
      if (loadingCap) {
        clearTimeout(loadingCap);
        loadingCap = null;
      }
      stopHealing();
    };
    // Mount-only: restore must not re-run when login/logout change callback identities
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handles automatic logout events and tab visibility changes
   */
  useEffect(() => {
    const handleAutoLogout = (event: Event) => {
      // httpClient dispatches this only after the server REJECTED the refresh cookie,
      // so this is a local cleanup: never call the server logout for it.
      // Remote tabs send the same event with detail.remote — do not re-broadcast (and
      // never POST /api/auth/logout/, which could blacklist a tab that just signed in).
      const remote =
        event instanceof CustomEvent &&
        Boolean((event.detail as { remote?: boolean } | undefined)?.remote);
      if (!remote) {
        console.log("Automatic logout triggered by HTTP client");
      }
      clearLocalSession(undefined, { broadcast: !remote });
    };

    const persistedUserMissing = () => {
      try {
        return !localStorage.getItem("user");
      } catch {
        return false;
      }
    };

    /** Other tab cleared the shared `user` marker: drop this tab's in-memory session. */
    const dropSessionIfPersistedUserGone = (): boolean => {
      if (!tokenRef.current) return false;
      if (!persistedUserMissing()) return false;
      clearLocalSession(undefined, { broadcast: false });
      return true;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (dropSessionIfPersistedUserGone()) return;

      const access = tokenRef.current;
      if (!access) return;

      const generationAtCheck = authGeneration.snapshot();
      const accessAtCheck = getAccessToken();

      void validateToken(access).then(async (check) => {
        if (!authGeneration.isCurrent(generationAtCheck)) {
          return;
        }

        if (check.status === "ok") {
          setUser(check.user);
          localStorage.setItem("user", JSON.stringify(check.user));
          return;
        }

        if (check.status === "transient") {
          // Network blip / throttle / deploy: keep the session, try again next time.
          return;
        }

        console.log("Token invalid on tab focus, attempting refresh...");
        const result = await refreshSession(generationAtCheck);
        if (
          result === "rejected" &&
          authGeneration.isCurrent(generationAtCheck) &&
          !hasReplacementSession(accessAtCheck, getAccessToken)
        ) {
          clearLocalSession();
        }
      });
    };

    const unsubscribeRemote = subscribeRemoteSessionEnded(() => {
      window.dispatchEvent(
        new CustomEvent("auth:logout", { detail: { remote: true } })
      );
    });

    window.addEventListener("auth:logout", handleAutoLogout);
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribeRemote();
      window.removeEventListener("auth:logout", handleAutoLogout);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearLocalSession, refreshSession, validateToken, authGeneration]);

  /**
   * Logs in a user with provided access token and user data.
   * Refresh is expected to already be set as an httpOnly cookie by the API.
   */
  const login = useCallback(
    (tokens: AuthTokens, newUser: User) => {
      authGeneration.bump();
      const normalized: User = {
        ...newUser,
        name: formatUserDisplayName(newUser),
      };
      setAccessToken(tokens.access);
      setToken(tokens.access);
      setUser(normalized);
      localStorage.setItem("user", JSON.stringify(normalized));
      clearLegacyTokenStorage();
      setLoading(false);
    },
    [authGeneration]
  );

  const contextValue: AuthContextType = {
    user,
    token,
    login,
    logout,
    loading,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
