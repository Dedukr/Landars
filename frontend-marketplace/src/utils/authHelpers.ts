/**
 * Only allow relative paths on our site (no protocol, no //, no external hosts).
 * Rejects auth/recovery pages so login never loops back onto itself.
 */
export function getSafeNextRedirect(next: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  try {
    let decoded = decodeURIComponent(next.trim());
    // Tolerate accidental double-encoding from nested links
    if (decoded.includes("%2F") || decoded.includes("%2f")) {
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        /* keep first decode */
      }
    }

    if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;

    // Browsers parse "\" like "/" and silently drop tab/CR/LF, so "/\evil.com",
    // "/%09/evil.com" or "/%5Cevil.com" (after decoding) would navigate to
    // https://evil.com/. Reject backslashes and control characters outright ...
    for (const ch of decoded) {
      const code = ch.charCodeAt(0);
      if (ch === "\\" || code < 0x20 || code === 0x7f) return null;
    }
    // ... and require that the value still resolves to a path on OUR origin.
    try {
      if (new URL(decoded, "https://safe.invalid").origin !== "https://safe.invalid") {
        return null;
      }
    } catch {
      return null;
    }

    const pathOnly =
      decoded.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    const blocked = ["/auth", "/verify-email", "/reset-password"];
    if (blocked.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Build auth page URL with optional return path (next).
 */
export function getAuthUrl(options: {
  mode?: "signin" | "signup";
  next?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options.mode) params.set("mode", options.mode);
  const safeNext = getSafeNextRedirect(options.next ?? null);
  if (safeNext) {
    params.set("next", safeNext);
  }
  const q = params.toString();
  return q ? `/auth?${q}` : "/auth";
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The HTTP response attached by `httpClient` to the errors it throws. */
function getErrorResponse(error: unknown): JsonRecord | null {
  if (!isRecord(error)) return null;
  const response = error.response;
  return isRecord(response) ? response : null;
}

/**
 * JSON body of the failed HTTP response (`error.response.data`), or `null` when
 * there was no response or the body was not a JSON object.
 */
export function getAuthErrorPayload(error: unknown): JsonRecord | null {
  const data = getErrorResponse(error)?.data;
  return isRecord(data) ? data : null;
}

const NETWORK_ERROR_PATTERNS = [
  "load failed",
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network request failed",
  "network error",
  "request timed out",
  "the internet connection appears to be offline",
  "the network connection was lost",
  "could not connect to the server",
  "a server with the specified hostname could not be found",
];

/** `httpClient` / `fetchWithTimeout` timeout (no HTTP response at all). */
function isAuthTimeoutError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.isTimeout === true || error.name === "FetchTimeoutError";
}

/**
 * True when the request never produced an HTTP response: fetch rejected
 * (Safari "Load failed", Chrome "Failed to fetch", Firefox "NetworkError ...")
 * or timed out. Errors that carry an HTTP response are never network errors, and
 * an arbitrary `TypeError` (e.g. a bug while reading the response) is not either
 * unless the client flagged it (`isNetworkError` / `isTimeout`) or its message
 * matches a known fetch-failure text.
 */
export function isAuthNetworkError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.isNetworkError === true || error.isTimeout === true) return true;
  if (getErrorResponse(error)) return false;
  if (!(error instanceof Error)) return false;
  if (error.name === "FetchTimeoutError") return true;
  if (!error.message) return false;
  const msg = error.message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export const AUTH_NETWORK_ERROR_MESSAGE =
  "Network error. Your account may have been created — it is safe to submit the same details again to continue, or try signing in.";

export const AUTH_LOGIN_NETWORK_ERROR_MESSAGE =
  "Network error. Please check your connection and try again.";

export type AuthErrorContext =
  | "login"
  | "register"
  | "verify"
  | "resend"
  | "reset";

export type AuthErrorCode =
  | "rate_limited"
  | "email_exists"
  | "account_not_found"
  | "invalid_password"
  | "account_inactive"
  | "email_not_verified"
  | "token_invalid"
  | "token_expired"
  | "validation_error"
  | "cooldown"
  | "server_error"
  | "network"
  | "timeout"
  | "unknown";

export interface DescribedAuthError {
  /** Customer-safe text (never a raw HTTP status line). */
  message: string;
  code: AuthErrorCode;
  status?: number;
  /** Seconds to wait before retrying (`rate_limited` / `cooldown`). */
  retryAfter?: number;
  /** Support reference (`X-Request-ID`); already appended to `message` when useful. */
  requestId?: string;
}

/** Backend `code` values (see the HTTP contract); anything else is ignored. */
const SERVER_CODES: Record<string, AuthErrorCode> = {
  rate_limited: "rate_limited",
  throttled: "rate_limited",
  cooldown: "cooldown",
  email_exists: "email_exists",
  account_not_found: "account_not_found",
  invalid_password: "invalid_password",
  account_inactive: "account_inactive",
  email_not_verified: "email_not_verified",
  token_invalid: "token_invalid",
  token_expired: "token_expired",
  validation_error: "validation_error",
  server_error: "server_error",
};

/** Codes where the customer may need to quote a reference to support. */
const REFERENCE_CODES: ReadonlySet<AuthErrorCode> = new Set([
  "server_error",
  "unknown",
  "rate_limited",
]);

/** Codes for which trying the same request again later can work. */
const TRANSIENT_CODES: ReadonlySet<AuthErrorCode> = new Set([
  "rate_limited",
  "cooldown",
  "server_error",
  "network",
  "timeout",
]);

/** Payload keys that carry metadata, not a message for the customer. */
const NON_MESSAGE_KEYS = new Set([
  "code",
  "request_id",
  "retry_after",
  "suggestion",
  "field",
  "email",
  "can_resend",
  "already_verified",
  "cooldown_total",
  "cooldown_remaining",
  "next_request_allowed_in",
  "user",
]);

const MAX_SERVER_MESSAGE_LENGTH = 400;
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const SERVER_ERROR_MESSAGE =
  "Something went wrong on our side. Please try again in a moment.";
const UNKNOWN_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Whether retrying the same request later can succeed (network, 5xx, waits). */
export function isTransientAuthError(code: AuthErrorCode): boolean {
  return TRANSIENT_CODES.has(code);
}

/** "45 seconds", "3 minutes" (from 2 minutes up), "2 hours" (from 2 hours up). */
export function formatWaitTime(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 120) return `${s} second${s === 1 ? "" : "s"}`;
  if (s < 7200) return `${Math.ceil(s / 60)} minutes`;
  return `${Math.ceil(s / 3600)} hours`;
}

/** Compact live countdown for buttons: "45s", then "2:05". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function toWaitSeconds(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.ceil(n), MAX_RETRY_AFTER_SECONDS);
}

function toRequestId(value: unknown): string | undefined {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value)
    ? value
    : undefined;
}

function textFrom(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text && text.length <= MAX_SERVER_MESSAGE_LENGTH ? text : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    const text = parts.join(" ");
    return text && text.length <= MAX_SERVER_MESSAGE_LENGTH ? text : null;
  }
  return null;
}

/**
 * Message the backend wrote for the customer (`error` / `message` / `detail` /
 * `non_field_errors`, then the first DRF field-error list such as
 * `{new_password: ["..."]}`). Only used for codes where the wording carries the
 * information (validation) and as a last resort for unknown 4xx responses — never
 * to decide what happened.
 */
function serverMessageFrom(payload: JsonRecord | null): string | null {
  if (!payload) return null;
  for (const key of ["error", "message", "detail", "non_field_errors"]) {
    const text = textFrom(payload[key]);
    if (text) return text;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (NON_MESSAGE_KEYS.has(key)) continue;
    const text = textFrom(value);
    if (text) return text;
  }
  return null;
}

function networkMessage(
  code: "network" | "timeout",
  context: AuthErrorContext
): string {
  if (context === "register") {
    return code === "timeout"
      ? "The request took too long. Your account may have been created — it is safe to submit the same details again to continue, or try signing in."
      : AUTH_NETWORK_ERROR_MESSAGE;
  }
  if (code === "timeout") {
    return "The request timed out. Please check your connection and try again.";
  }
  switch (context) {
    case "verify":
      return "We couldn't reach the server to verify your email. Please check your connection and try again.";
    case "resend":
      return "We couldn't send the email. Please check your connection and try again.";
    default:
      return AUTH_LOGIN_NETWORK_ERROR_MESSAGE;
  }
}

function messageFor(
  code: AuthErrorCode,
  context: AuthErrorContext,
  retryAfter: number | undefined,
  serverMessage: string | null
): string {
  const wait = retryAfter ? formatWaitTime(retryAfter) : null;
  switch (code) {
    case "rate_limited":
      return `Too many attempts. Please wait ${wait ?? "a minute"} and try again.`;
    case "cooldown": {
      const what =
        context === "resend"
          ? "A verification email was sent a moment ago. Please wait"
          : context === "reset"
            ? "A reset link was sent a moment ago. Please wait"
            : "Please wait";
      const suffix =
        context === "resend" || context === "reset"
          ? "before requesting another one."
          : "before trying again.";
      return `${what} ${wait ?? "a moment"} ${suffix}`;
    }
    case "email_exists":
      return "An account with this email address already exists.";
    case "account_not_found":
      return "No account found with this email address.";
    case "invalid_password":
      return "Incorrect password for this email address. Please try again.";
    case "account_inactive":
      return "This account is currently inactive. Please contact support for help.";
    case "email_not_verified":
      return "Please verify your email address before signing in. Check your inbox for the verification link.";
    case "token_invalid":
      return context === "reset"
        ? "This password reset link is invalid or has already been used. Please request a new one."
        : "This link is invalid or has already been used.";
    case "token_expired":
      return context === "reset"
        ? "This password reset link has expired. Please request a new one."
        : "This link has expired.";
    case "validation_error":
      return (
        serverMessage ?? "Please check the details you entered and try again."
      );
    case "server_error":
      return SERVER_ERROR_MESSAGE;
    case "network":
    case "timeout":
      return networkMessage(code, context);
    default:
      return serverMessage ?? UNKNOWN_ERROR_MESSAGE;
  }
}

function classifyHttpError(
  status: number,
  payload: JsonRecord | null
): AuthErrorCode {
  const rawCode = typeof payload?.code === "string" ? payload.code : "";
  if (rawCode && Object.prototype.hasOwnProperty.call(SERVER_CODES, rawCode)) {
    return SERVER_CODES[rawCode];
  }
  if (status === 429) {
    // Older backends send `cooldown_remaining` without a `code`.
    return typeof payload?.cooldown_remaining === "number"
      ? "cooldown"
      : "rate_limited";
  }
  if (payload?.suggestion === "create_account") return "account_not_found";
  // 5xx, or an HTML/empty body from nginx / Cloudflare in front of the API.
  if (status >= 500 || !payload || Object.keys(payload).length === 0) {
    return "server_error";
  }
  return status === 400 ? "validation_error" : "unknown";
}

/**
 * Turn whatever a sign-up / sign-in / verify / reset call threw into a
 * customer-safe message plus a stable machine code. Logic keys off HTTP status,
 * the `code` field of the response and structured extras (`retry_after`,
 * `cooldown_remaining`, `suggestion`) — never off the English wording of the
 * backend text. Works with errors from the current `httpClient`
 * (`response.data/status`) and the upgraded one (`response.requestId/retryAfter`,
 * `isNetworkError`, `isTimeout`).
 */
export function describeAuthError(
  error: unknown,
  context: AuthErrorContext
): DescribedAuthError {
  const response = getErrorResponse(error);
  const status =
    response && typeof response.status === "number" && response.status > 0
      ? response.status
      : undefined;
  const payload = getAuthErrorPayload(error);
  const requestId =
    toRequestId(response?.requestId) ?? toRequestId(payload?.request_id);

  let code: AuthErrorCode;
  let retryAfter: number | undefined;

  if (status === undefined) {
    // No HTTP answer at all.
    if (isAuthTimeoutError(error)) {
      code = "timeout";
    } else if (isAuthNetworkError(error)) {
      code = "network";
    } else if (error instanceof SyntaxError) {
      // A 2xx whose body was not JSON: something in front of the API answered.
      code = "server_error";
    } else {
      code = "unknown";
    }
  } else {
    code = classifyHttpError(status, payload);
    if (code === "rate_limited" || code === "cooldown") {
      retryAfter =
        toWaitSeconds(response?.retryAfter) ??
        toWaitSeconds(payload?.retry_after) ??
        toWaitSeconds(payload?.cooldown_remaining);
    }
  }

  const serverMessage =
    code === "validation_error" || code === "unknown"
      ? serverMessageFrom(payload)
      : null;
  let message = messageFor(code, context, retryAfter, serverMessage);
  if (requestId && REFERENCE_CODES.has(code)) {
    message = `${message} Reference: ${requestId}`;
  }

  const described: DescribedAuthError = { message, code };
  if (status !== undefined) described.status = status;
  if (retryAfter !== undefined) described.retryAfter = retryAfter;
  if (requestId) described.requestId = requestId;
  return described;
}

/** Copy after POST /api/auth/resend-verification/ (explicit false = not queued). */
export function describeResendQueuedNotice(
  data: { already_verified?: boolean; email_queued?: boolean } | undefined,
  email: string
): { kind: "success" | "error"; message: string } {
  if (data?.already_verified) {
    return {
      kind: "success",
      message: "Your email address is already verified. You can sign in now.",
    };
  }
  if (data?.email_queued === false) {
    return {
      kind: "error",
      message:
        "We could not send the verification email. Please try again in a moment.",
    };
  }
  return {
    kind: "success",
    message: `We've sent a new link to ${email}. Please check your inbox (and your spam folder).`,
  };
}
