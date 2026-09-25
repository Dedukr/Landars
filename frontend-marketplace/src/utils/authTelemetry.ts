/**
 * Best-effort client-side auth failure beacon.
 *
 * Sends one small JSON event to `POST /api/auth/client-event/` when an auth call fails in the
 * browser (network / timeout / 429 / 5xx / refresh rejected or transient / CSRF), so that a
 * customer's "I can't sign in" report can be matched with the server log by `request_id`.
 *
 * Guarantees:
 * - never throws and never blocks (fire-and-forget; `sendBeacon` first, `fetch keepalive` fallback);
 * - never reports failures of the client-event endpoint itself (no feedback loop);
 * - never includes tokens, e-mails, passwords, error *messages* or query strings - only a
 *   whitelisted set of short fields;
 * - rate-limited per page: max 1 event per (op, stage, status) per 30 s and 20 per page life.
 *
 * Deliberately does NOT use `httpClient` (that would recurse into the failure path).
 */
import { getClientApiBaseUrl } from "@/config/api";

export type AuthClientOp =
  | "login"
  | "register"
  | "refresh"
  | "verify"
  | "resend"
  | "reset"
  | "restore";

export type AuthClientStage =
  | "network"
  | "timeout"
  | "http"
  | "parse"
  | "csrf"
  | "refresh_rejected"
  | "refresh_transient"
  | "restore_transient";

export interface AuthClientEvent {
  op: AuthClientOp;
  stage: AuthClientStage;
  /** HTTP status when the failure was an HTTP response; omitted/`null` otherwise. */
  status?: number | null;
  /** An `Error` (only its `name` is sent) or a short error name. Messages are never sent. */
  error?: unknown;
  /** Server `X-Request-ID` of the failed response, if any. */
  requestId?: string | null;
  /** API path of the failed call (origin, query and fragment are stripped). */
  path?: string | null;
}

const OPS: ReadonlySet<string> = new Set([
  "login",
  "register",
  "refresh",
  "verify",
  "resend",
  "reset",
  "restore",
]);

const STAGES: ReadonlySet<string> = new Set([
  "network",
  "timeout",
  "http",
  "parse",
  "csrf",
  "refresh_rejected",
  "refresh_transient",
  "restore_transient",
]);

const CLIENT_EVENT_PATH = "/api/auth/client-event/";
const DEDUPE_WINDOW_MS = 30_000;
const MAX_EVENTS_PER_PAGE = 20;

// Field limits mirror the server validators (backend/account/client_events.py): anything
// outside them makes the endpoint answer 400 and the event is lost, so sanitise up front.
const MAX_ERROR_NAME_LENGTH = 40; // error: [A-Za-z0-9_. -]{0,40} (no colon, no "$")
const MAX_PATH_LENGTH = 80; // path: /api/auth/[A-Za-z0-9/_-]*
/** Only plain auth API paths are ever sent (lowercase words, digits, dashes, slashes). */
const SAFE_PATH = /^\/api\/auth\/[a-z0-9/_-]*$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/; // request_id: same rule as X-Request-ID

const lastSentAt = new Map<string, number>();
let sentCount = 0;

/** Test helper: forget the per-page rate-limit state. */
export function _resetAuthTelemetryForTests(): void {
  lastSentAt.clear();
  sentCount = 0;
}

function normalizePath(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  let path = raw.split(/[?#]/)[0];
  // Absolute URL -> pathname only (never send the origin).
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  return path || undefined;
}

function errorName(error: unknown): string | undefined {
  let name: string | undefined;
  if (error instanceof Error) {
    name = error.name || error.constructor?.name;
  } else if (typeof error === "string") {
    name = error;
  }
  if (!name) return undefined;
  const cleaned = name
    .replace(/[^A-Za-z0-9_. -]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MAX_ERROR_NAME_LENGTH)
    .trim();
  return cleaned || undefined;
}

function send(url: string, body: string): void {
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      typeof Blob !== "undefined"
    ) {
      const queued = navigator.sendBeacon(
        url,
        new Blob([body], { type: "application/json" })
      );
      if (queued) return;
    }
  } catch {
    // fall through to fetch
  }

  try {
    if (typeof fetch === "function") {
      const pending = fetch(url, {
        method: "POST",
        keepalive: true,
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body,
      }) as Promise<unknown> | undefined;
      if (pending && typeof pending.catch === "function") {
        pending.catch(() => undefined);
      }
    }
  } catch {
    // best effort only
  }
}

export function reportAuthClientEvent(event: AuthClientEvent): void {
  try {
    if (typeof window === "undefined" || !event) return;
    if (!OPS.has(event.op) || !STAGES.has(event.stage)) return;

    const normalizedPath = normalizePath(event.path);
    if (normalizedPath && normalizedPath.startsWith(CLIENT_EVENT_PATH.slice(0, -1))) {
      return; // never report the client-event endpoint's own failures
    }

    const status =
      typeof event.status === "number" &&
      Number.isInteger(event.status) &&
      event.status >= 100 &&
      event.status <= 599
        ? event.status
        : null;

    const key = `${event.op}|${event.stage}|${status ?? "-"}`;
    const now = Date.now();
    const last = lastSentAt.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
    if (sentCount >= MAX_EVENTS_PER_PAGE) return;
    lastSentAt.set(key, now);
    sentCount += 1;

    const payload: Record<string, unknown> = {
      op: event.op,
      stage: event.stage,
      status,
    };
    const name = errorName(event.error);
    if (name) payload.error = name;
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      payload.online = navigator.onLine;
    }
    if (typeof event.requestId === "string" && SAFE_REQUEST_ID.test(event.requestId)) {
      payload.request_id = event.requestId;
    }
    if (
      normalizedPath &&
      normalizedPath.length <= MAX_PATH_LENGTH &&
      SAFE_PATH.test(normalizedPath)
    ) {
      payload.path = normalizedPath;
    }

    send(`${getClientApiBaseUrl()}${CLIENT_EVENT_PATH}`, JSON.stringify(payload));
  } catch {
    // telemetry must never affect the auth flow
  }
}
