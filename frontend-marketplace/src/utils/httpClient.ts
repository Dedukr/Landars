/**
 * Professional HTTP Client with Automatic Token Refresh
 *
 * This module provides a robust HTTP client that automatically handles:
 * - JWT token refresh on expiration (tri-state outcome: ok / rejected / transient)
 * - Request retry logic
 * - CSRF token management (reset + retry when the cached token went stale)
 * - Error handling and user feedback (request id, Retry-After, network/timeout flags)
 *
 * Session-safety rule: only a definitive server rejection (401 from the refresh endpoint)
 * clears local auth state. Network errors, timeouts, 429 and 5xx are "transient" and never
 * sign the customer out.
 */

import { getClientApiBaseUrl } from "@/config/api";
import {
  reportAuthClientEvent,
  type AuthClientOp,
} from "@/utils/authTelemetry";
import {
  clearAccessToken,
  clearLegacyTokenStorage,
  getAccessToken,
  setAccessToken,
} from "@/utils/authTokenStore";
import {
  AUTH_FETCH_TIMEOUT_MS,
  FetchTimeoutError,
  fetchWithTimeout,
} from "@/utils/fetchWithTimeout";
import { withRefreshLock } from "@/utils/refreshLock";

// Types for the HTTP client
interface RequestConfig extends RequestInit {
  skipAuth?: boolean;
  skipCSRF?: boolean;
  retryCount?: number;
  maxRetries?: number;
  /** When set, wraps the request in fetchWithTimeout (ms). */
  timeoutMs?: number;
}

interface RefreshTokenResponse {
  access: string;
  refresh?: string;
}

/** `error.response` on errors thrown for HTTP error statuses. */
export interface HttpErrorResponse {
  data: unknown;
  status: number;
  /** `X-Request-ID` response header, else `data.request_id`. */
  requestId?: string;
  /** `Retry-After` header (seconds), else `data.retry_after`. */
  retryAfter?: number;
}

/**
 * Error thrown by {@link HttpClient.request}.
 * - HTTP error statuses carry `response`.
 * - Failures before an HTTP response carry `isNetworkError` (fetch rejected) or
 *   `isTimeout` (FetchTimeoutError) and no `response`.
 */
export type HttpError = Error & {
  response?: HttpErrorResponse;
  isNetworkError?: boolean;
  isTimeout?: boolean;
};

/**
 * Outcome of a refresh attempt:
 * - "ok": a new access token was obtained and stored;
 * - "rejected": the server definitively refused the refresh cookie (local auth was cleared);
 * - "transient": network error / timeout / 429 / 5xx / malformed body - nothing was cleared,
 *   the session may still be valid, try again later.
 */
export type RefreshOutcome = "ok" | "rejected" | "transient";

// Global state for token refresh (in-tab single-flight; cross-tab is refreshLock.ts)
let isRefreshing = false;
let refreshPromise: Promise<RefreshOutcome> | null = null;
let failedQueue: Array<(outcome: RefreshOutcome) => void> = [];

// CSRF token management
let csrfToken: string | null = null;

const REFRESH_PATH = "/api/auth/token/refresh/";

/**
 * Build an error for an HTTP error response, carrying `response.{data,status,requestId,retryAfter}`.
 */
function buildHttpError(
  response: Response,
  data: unknown,
  message?: string
): HttpError {
  const error = new Error(
    message ?? formatApiErrorMessage(data, response.status, response.statusText)
  ) as HttpError;
  const details: HttpErrorResponse = { data, status: response.status };
  const requestId = extractRequestId(response, data);
  if (requestId) details.requestId = requestId;
  const retryAfter = extractRetryAfter(response, data);
  if (retryAfter !== undefined) details.retryAfter = retryAfter;
  error.response = details;
  return error;
}

function readHeader(response: Response, name: string): string | null {
  try {
    return response.headers?.get?.(name) ?? null;
  } catch {
    return null;
  }
}

function extractRequestId(response: Response, data: unknown): string | undefined {
  const header = readHeader(response, "X-Request-ID")?.trim();
  if (header) return header;
  if (data && typeof data === "object") {
    const fromBody = (data as Record<string, unknown>).request_id;
    if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  }
  return undefined;
}

function extractRetryAfter(response: Response, data: unknown): number | undefined {
  const header = readHeader(response, "Retry-After")?.trim();
  if (header) {
    if (/^\d+$/.test(header)) return Number(header);
    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
    }
  }
  if (data && typeof data === "object") {
    const raw = (data as Record<string, unknown>).retry_after;
    const seconds =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.trim())
          ? Number(raw)
          : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  }
  return undefined;
}

/** True when a 403 body is a CSRF failure (DRF: "CSRF Failed: ..."). */
function mentionsCSRF(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const body = data as Record<string, unknown>;
  return [body.detail, body.error, body.message].some(
    (value) => typeof value === "string" && /csrf/i.test(value)
  );
}

/**
 * Flag a rejected `fetch` as a network error or timeout. Caller-initiated aborts and errors
 * that already carry an HTTP response are returned untouched.
 */
function toTransportError(error: unknown): unknown {
  if (error instanceof Error) {
    if (error.name === "AbortError") return error;
    if ((error as HttpError).response !== undefined) return error;
  }
  const flagged = (
    error instanceof Error ? error : new Error(String(error))
  ) as HttpError;
  if (error instanceof FetchTimeoutError || flagged.name === "FetchTimeoutError") {
    flagged.isTimeout = true;
  } else {
    flagged.isNetworkError = true;
  }
  return flagged;
}

const AUTH_OP_PREFIXES: ReadonlyArray<readonly [string, AuthClientOp]> = [
  ["login", "login"],
  ["register", "register"],
  ["token/refresh", "refresh"],
  ["verify-email", "verify"],
  ["check-verification", "verify"],
  ["resend-verification", "resend"],
  ["password-reset", "reset"],
];

/** Telemetry op for an `/api/auth/*` request path (null = not reported). */
function authOpForPath(url: string): AuthClientOp | null {
  const path = url
    .split(/[?#]/)[0]
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  const prefix = "/api/auth/";
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  for (const [name, op] of AUTH_OP_PREFIXES) {
    if (rest === name || rest.startsWith(`${name}/`)) return op;
  }
  return null;
}

/**
 * Fetch CSRF token from the backend
 */
async function fetchCSRFToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetchWithTimeout(
      `${getClientApiBaseUrl()}/api/auth/csrf-token/`,
      {
        method: "GET",
        credentials: "include",
      },
      AUTH_FETCH_TIMEOUT_MS
    );

    if (response.ok) {
      const data = await response.json();
      csrfToken = data.csrfToken;
      return csrfToken || "";
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw buildHttpError(response, errorData, "Failed to fetch CSRF token");
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
 * Resolve every caller that queued behind the in-flight refresh with the same outcome
 */
function processQueue(outcome: RefreshOutcome) {
  failedQueue.forEach((resolve) => resolve(outcome));
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
  try {
    localStorage.removeItem("user");
    if (hadAccessToken) {
      localStorage.removeItem("wishlist");
      localStorage.removeItem("guest_wishlist");
    }
  } catch {
    // storage unavailable (blocked / private mode): nothing persisted to clear
  }
}

function hasPersistedUser(): boolean {
  try {
    return Boolean(localStorage.getItem("user"));
  } catch {
    return false;
  }
}

/**
 * Read a JSON body without letting a stalled body hold the in-tab single-flight (and the
 * cross-tab refresh lock) forever - `fetchWithTimeout` only bounds the response headers.
 */
function readJsonBounded<T>(
  response: Response,
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new FetchTimeoutError("Response body timed out")),
      timeoutMs
    );
    response.json().then(
      (value: T) => {
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

type RefreshAttempt =
  | { kind: "ok"; access: string }
  | { kind: "rejected"; status: number }
  | { kind: "csrf" }
  | { kind: "transient"; status?: number; error?: unknown; requestId?: string };

type RefreshResult = Exclude<RefreshAttempt, { kind: "csrf" }>;

/**
 * One refresh round-trip (CSRF token if needed + POST) classified without side effects.
 */
async function attemptRefreshRequest(): Promise<RefreshAttempt> {
  let token: string;
  try {
    token = csrfToken || (await fetchCSRFToken());
  } catch (error) {
    const failure = error as HttpError;
    return {
      kind: "transient",
      error,
      status: failure?.response?.status,
      requestId: failure?.response?.requestId,
    };
  }

  if (!token) {
    // 200 without a token (proxy page / broken endpoint): not a verdict on the session.
    const missing = new Error("CSRF token missing from response");
    missing.name = "MalformedResponseError";
    return { kind: "transient", error: missing };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${getClientApiBaseUrl()}${REFRESH_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": token,
        },
        credentials: "include",
        body: JSON.stringify({}),
      },
      AUTH_FETCH_TIMEOUT_MS
    );
  } catch (error) {
    // Network error, Safari "Load failed", 10 s timeout: says nothing about the session.
    return { kind: "transient", error };
  }

  if (response.ok) {
    try {
      const data = await readJsonBounded<RefreshTokenResponse>(response);
      if (data && typeof data.access === "string" && data.access) {
        return { kind: "ok", access: data.access };
      }
      const malformed = new Error("Malformed refresh response");
      malformed.name = "MalformedResponseError";
      return { kind: "transient", status: response.status, error: malformed };
    } catch (error) {
      return { kind: "transient", status: response.status, error };
    }
  }

  if (response.status === 401) return { kind: "rejected", status: 401 };
  if (response.status === 403) {
    // Only a real CSRF failure (DRF: "CSRF Failed: ...") is retried with a fresh token and,
    // if it persists, ends the session. Any other 403 (a WAF / Cloudflare challenge page,
    // an upstream ACL) says nothing about the refresh token: never sign the customer out.
    let body: unknown;
    try {
      body = await readJsonBounded<unknown>(response);
    } catch {
      body = undefined;
    }
    if (mentionsCSRF(body)) return { kind: "csrf" };
    return {
      kind: "transient",
      status: 403,
      requestId: extractRequestId(response, body),
    };
  }

  // 429, 5xx (deploy blip, throttle) and anything unexpected: never sign the customer out.
  return {
    kind: "transient",
    status: response.status,
    requestId: extractRequestId(response, undefined),
  };
}

/**
 * The network part of a refresh; runs under the cross-tab lock. A 403 (stale/missing CSRF
 * token) resets the cached token, fetches a new one and retries ONCE; a second 403 is final.
 */
async function runRefreshExchange(): Promise<RefreshResult> {
  let attempt = await attemptRefreshRequest();

  if (attempt.kind === "csrf") {
    reportAuthClientEvent({
      op: "refresh",
      stage: "csrf",
      status: 403,
      path: REFRESH_PATH,
    });
    resetCSRFToken();
    attempt = await attemptRefreshRequest();
    if (attempt.kind === "csrf") {
      resetCSRFToken();
      return { kind: "rejected", status: 403 };
    }
  }

  return attempt;
}

/**
 * Attempt to refresh the access JWT via httpOnly refresh cookie.
 * Only a definitive rejection clears local auth state.
 */
async function refreshJWTToken(): Promise<RefreshOutcome> {
  const accessAtStart = getAccessToken();
  const hadAccessToken = Boolean(accessAtStart);

  let result: RefreshResult;
  try {
    // Held across the fetch so the browser has applied the rotated Set-Cookie before
    // another tab refreshes with it.
    result = await withRefreshLock(runRefreshExchange);
  } catch (error) {
    console.error("Token refresh error:", error);
    result = { kind: "transient", error };
  }

  // A login/logout that completed while the refresh was in flight wins: never clobber it.
  const sessionUnchanged = getAccessToken() === accessAtStart;

  if (result.kind === "ok") {
    if (sessionUnchanged) {
      setAccessToken(result.access);
      clearLegacyTokenStorage();
    }
    return "ok";
  }

  if (result.kind === "rejected") {
    if (sessionUnchanged) {
      clearAuthAfterFailedRefresh(hadAccessToken);
    }
    // A missing cookie is the normal anonymous outcome; only report when a session existed.
    if (hadAccessToken || hasPersistedUser()) {
      reportAuthClientEvent({
        op: "refresh",
        stage: "refresh_rejected",
        status: result.status,
        path: REFRESH_PATH,
      });
    }
    return "rejected";
  }

  reportAuthClientEvent({
    op: "refresh",
    stage: "refresh_transient",
    status: result.status ?? null,
    error: result.error,
    requestId: result.requestId,
    path: REFRESH_PATH,
  });
  return "transient";
}

/**
 * Handle token refresh with queue management.
 * Concurrent callers wait for the in-flight refresh and receive the same outcome
 * (never a spurious failure from "already refreshing").
 */
async function handleTokenRefresh(): Promise<RefreshOutcome> {
  if (isRefreshing) {
    // If already refreshing, wait for the existing promise
    return new Promise<RefreshOutcome>((resolve) => {
      failedQueue.push(resolve);
    });
  }

  isRefreshing = true;
  refreshPromise = refreshJWTToken();

  try {
    const outcome = await refreshPromise;
    processQueue(outcome);
    return outcome;
  } catch (error) {
    // refreshJWTToken classifies its own failures; an unexpected throw must not sign out.
    console.error("Token refresh error:", error);
    processQueue("transient");
    return "transient";
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Shared single-flight JWT refresh returning the detailed outcome.
 * Uses httpOnly refresh cookie; updates in-memory / sessionStorage access token on "ok".
 */
export function refreshAuthTokensDetailed(): Promise<RefreshOutcome> {
  return handleTokenRefresh();
}

/**
 * Shared single-flight JWT refresh for AuthContext and HTTP 401 retry.
 * Resolves true only when a new access token was obtained.
 */
export async function refreshAuthTokens(): Promise<boolean> {
  return (await handleTokenRefresh()) === "ok";
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
      timeoutMs,
      ...requestConfig
    } = config;
    const authOp = authOpForPath(url);

    // Prepare headers
    const headers = new Headers(requestConfig.headers);

    // Add CSRF token if not skipped
    if (!skipCSRF) {
      let token = csrfToken || getCSRFTokenFromCookie();
      if (!token) {
        try {
          token = await fetchCSRFToken();
        } catch (error) {
          const failure = toTransportError(error) as HttpError;
          if (authOp) {
            reportAuthClientEvent({
              op: authOp,
              stage: "csrf",
              status: failure?.response?.status ?? null,
              error: failure,
              requestId: failure?.response?.requestId,
              path: url,
            });
          }
          throw failure;
        }
      }
      headers.set("X-CSRFToken", token);
    }

    // Add Content-Type if not already set (skip for FormData — browser sets boundary)
    const body = requestConfig.body;
    const isFormData =
      typeof FormData !== "undefined" && body instanceof FormData;
    if (!headers.has("Content-Type") && !isFormData) {
      headers.set("Content-Type", "application/json");
    }

    // Add JWT token if not skipped and available
    const tokenAtStart = skipAuth ? null : getAuthToken();
    if (!skipAuth) {
      const authToken = tokenAtStart;
      if (authToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${authToken}`);
      }
    } else {
      // Remove any existing Authorization header when skipAuth is true
      headers.delete("Authorization");
    }

    const fetchInit: RequestInit = {
      ...requestConfig,
      headers,
      credentials: "include",
    };

    // Make the request (optional timeout for auth / long-poll sensitive calls)
    let response: Response;
    try {
      response =
        typeof timeoutMs === "number"
          ? await fetchWithTimeout(
              this.resolveBaseURL() + url,
              fetchInit,
              timeoutMs
            )
          : await fetch(this.resolveBaseURL() + url, fetchInit);
    } catch (error) {
      // fetch rejected: network error ("Load failed"/"Failed to fetch") or timeout.
      const failure = toTransportError(error) as HttpError;
      if (authOp && (failure?.isTimeout || failure?.isNetworkError)) {
        reportAuthClientEvent({
          op: authOp,
          stage: failure.isTimeout ? "timeout" : "network",
          error: failure,
          path: url,
        });
      }
      throw failure;
    }

    // Handle token expiration
    if (!skipAuth && isTokenExpired(response) && retryCount < maxRetries) {
      console.log("Token expired, attempting refresh...");

      const outcome = await handleTokenRefresh();

      if (outcome === "ok") {
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
      } else if (outcome === "rejected") {
        // Server definitively refused the refresh cookie: the session is over. Skip the
        // announcement when a newer login replaced the session while we were refreshing.
        const currentToken = getAuthToken();
        if (!currentToken || currentToken === tokenAtStart) {
          this.triggerLogout();
        }
        throw new Error("Authentication failed. Please log in again.");
      } else {
        // Transient (network/timeout/429/5xx): the session may still be valid - do NOT log out.
        const error = new Error(
          "Network error. Please check your connection and try again."
        ) as HttpError;
        error.isNetworkError = true;
        throw error;
      }
    }

    // Handle other HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Preserve the full response data for error handling
      const error = buildHttpError(response, errorData);
      const csrfFailure = response.status === 403 && mentionsCSRF(errorData);
      if (csrfFailure) {
        // Stale cached CSRF token: forget it so the next request fetches a fresh one.
        resetCSRFToken();
      }
      if (authOp) {
        if (csrfFailure) {
          reportAuthClientEvent({
            op: authOp,
            stage: "csrf",
            status: response.status,
            requestId: error.response?.requestId,
            path: url,
          });
        } else if (response.status === 429 || response.status >= 500) {
          reportAuthClientEvent({
            op: authOp,
            stage: "http",
            status: response.status,
            requestId: error.response?.requestId,
            path: url,
          });
        }
      }
      throw error;
    }

    // Return parsed JSON response
    try {
      return await response.json();
    } catch (error) {
      if (authOp) {
        reportAuthClientEvent({
          op: authOp,
          stage: "parse",
          status: response.status,
          error,
          path: url,
        });
      }
      throw error;
    }
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
    const isFormData =
      typeof FormData !== "undefined" && data instanceof FormData;
    return this.request<T>(url, {
      ...config,
      method: "POST",
      body:
        data === undefined || data === null
          ? undefined
          : isFormData
            ? (data as FormData)
            : JSON.stringify(data),
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
