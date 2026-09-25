"""Request ids, log plumbing and structured auth events.

Schema, PII policy and the "trace a customer" runbook: docs/AUTH_OBSERVABILITY.md.

This module is imported by ``settings.LOGGING`` (filter + formatter) *before*
Django's app registry is ready, so it must stay free of model imports and of
anything that touches the database or the cache at import time.

Nothing here may ever break a request: ``log_auth_event`` swallows its own
failures and the middleware only adds headers.
"""

from __future__ import annotations

import contextvars
import json
import logging
import math
import re
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum

from django.utils.crypto import salted_hmac

from .email_normalization import normalize_email

REQUEST_ID_HEADER = "X-Request-ID"
AUTH_PATH_PREFIX = "/api/auth/"
AUTH_EVENT_LOGGER = "account.auth"

_META_KEY = "HTTP_X_REQUEST_ID"
# fullmatch (not ^...$): "$" would also accept a trailing newline.
_REQUEST_ID_RE = re.compile(r"[A-Za-z0-9._-]{8,64}")
_CF_RAY_RE = re.compile(r"[A-Za-z0-9-]{1,40}")
_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "auth_request_id", default="-"
)

logger = logging.getLogger(__name__)


def get_request_id() -> str:
    """Id of the request being served by this thread, or "-" outside a request."""
    return _request_id_var.get()


def is_valid_request_id(value) -> bool:
    return isinstance(value, str) and _REQUEST_ID_RE.fullmatch(value) is not None


def _path_of(request) -> str:
    path = getattr(request, "path_info", None) or getattr(request, "path", None) or ""
    return path if isinstance(path, str) else ""


def is_auth_path(request) -> bool:
    return _path_of(request).startswith(AUTH_PATH_PREFIX)


_PATH_OPS = {
    "register": "register",
    "login": "login",
    "logout": "logout",
    "token": "token_obtain",
    "token/refresh": "refresh",
    "verify-email": "verify_email",
    "resend-verification": "resend_verification",
    "password-reset": "password_reset_request",
    "password-reset/confirm": "password_reset_confirm",
    "password-reset/validate": "password_reset_validate",
    "csrf-token": "csrf_token",
    "client-event": "client_event",
}


def op_for_path(path: str) -> str:
    """Map "/api/auth/login/" -> "login" (event ``op``); unknown auth paths -> "other"."""
    if not isinstance(path, str) or not path.startswith(AUTH_PATH_PREFIX):
        return "other"
    return _PATH_OPS.get(path[len(AUTH_PATH_PREFIX) :].strip("/"), "other")


class RequestIDMiddleware:
    """Give every request an id, echo it on the response and mark auth responses no-store.

    An incoming ``X-Request-ID`` (nginx sends ``$request_id``) is reused only when it
    is 8-64 chars of ``[A-Za-z0-9._-]`` - anything else could forge log lines - and is
    replaced by a fresh ``uuid4().hex``. Must be the FIRST middleware so CORS
    pre-flights and every error response carry the header too.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.META.get(_META_KEY, "")
        request_id = supplied if is_valid_request_id(supplied) else uuid.uuid4().hex
        request.request_id = request_id
        request._request_started_monotonic = time.monotonic()
        token = _request_id_var.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            # Worker threads are reused: a leaked value would tag the next request.
            try:
                _request_id_var.reset(token)
            except ValueError:
                _request_id_var.set("-")
        response[REQUEST_ID_HEADER] = request_id
        if is_auth_path(request) and not response.has_header("Cache-Control"):
            response["Cache-Control"] = "no-store"
        return response


class RequestIDLogFilter(logging.Filter):
    """Expose ``%(request_id)s`` ("-" outside a request) to every log formatter.

    Django logs 4xx responses ("Too Many Requests: /api/auth/login/") after the
    middleware chain has returned, when the context id is already reset; those
    records carry the request itself, so fall back to ``record.request``.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", None):
            request_id = get_request_id()
            if request_id == "-":
                candidate = getattr(getattr(record, "request", None), "request_id", None)
                if is_valid_request_id(candidate):
                    request_id = candidate
            record.request_id = request_id
        return True


def get_client_ip(request) -> str:
    """Client address exactly as DRF throttles see it (honours ``NUM_PROXIES``).

    Delegating to ``BaseThrottle.get_ident`` guarantees that the IP in the logs is
    the IP whose throttle bucket was consumed. Works with Django and DRF requests.
    """
    try:
        from rest_framework.throttling import BaseThrottle

        return BaseThrottle().get_ident(request) or ""
    except Exception:
        return ""


_EMAIL_HASH_SALT = "account.observability.email_hash.v1"


def hash_email(email) -> str:
    """Stable 16-hex pseudonym for an email: HMAC-SHA256 keyed from ``SECRET_KEY``.

    Uses the same normalisation as login/register, so casing, whitespace and
    zero-width variants of one address hash identically. Not reversible without
    the key; changes if ``SECRET_KEY`` is rotated. "" for empty/non-string input.
    """
    normalized = normalize_email(email)
    if not normalized:
        return ""
    return salted_hmac(_EMAIL_HASH_SALT, normalized, algorithm="sha256").hexdigest()[:16]


# --- user agent ------------------------------------------------------------------

_UA_BOT = re.compile(
    r"(?:bot|spider|crawl|slurp)\b|curl/|wget/|python-|go-http-client|java/|libwww"
    r"|headless|scrapy|okhttp|axios|node-fetch|postmanruntime",
    re.I,
)
_UA_IN_APP = re.compile(
    r"FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|TikTok|musical_ly|Snapchat"
    r"|LinkedInApp|Pinterest|Twitter|\bLine/|; wv\)",
    re.I,
)
_UA_IOS = re.compile(r"iPhone|iPad|iPod")
_UA_EDGE = re.compile(r"EdgiOS/|EdgA/|Edg/|Edge/")
_UA_OPERA = re.compile(r"OPR/|OPiOS/|Opera")
_UA_FIREFOX = re.compile(r"Firefox/|FxiOS/")
_UA_CHROME = re.compile(r"Chrome/|CriOS/|Chromium/")


def classify_user_agent(user_agent) -> str:
    """Coarse ``Browser-Platform`` label ("Safari-iOS", "Chrome-Android", ...).

    Never returns the raw UA. "none" = no header, "bot" = scripts/crawlers,
    "InApp-<platform>" = social-app / WebView browsers (a classic source of
    cookie and storage surprises), "other" = anything unrecognised.
    """
    ua = user_agent.strip() if isinstance(user_agent, str) else ""
    if not ua:
        return "none"
    if _UA_BOT.search(ua):
        return "bot"
    if _UA_IOS.search(ua):
        platform = "iOS"
    elif "Android" in ua:
        platform = "Android"
    else:
        platform = "Desktop"
    # iOS WKWebView UAs lack the "Safari/" token that real iOS browsers include.
    if _UA_IN_APP.search(ua) or (
        platform == "iOS" and "AppleWebKit" in ua and "Safari/" not in ua
    ):
        return f"InApp-{platform}"
    if _UA_EDGE.search(ua):
        browser = "Edge"
    elif _UA_OPERA.search(ua):
        browser = "Opera"
    elif "SamsungBrowser/" in ua:
        browser = "Samsung"
    elif _UA_FIREFOX.search(ua):
        browser = "Firefox"
    elif _UA_CHROME.search(ua):
        browser = "Chrome"
    elif "Safari/" in ua and "Version/" in ua:
        browser = "Safari"
    else:
        return "other"
    return f"{browser}-{platform}"


# --- sanitising ------------------------------------------------------------------

_MAX_STR = 200
_MAX_ITEMS = 20
_SENSITIVE_KEY_RE = re.compile(
    r"password|passwd|token|refresh|access|email|authorization|cookie|secret|bearer|jwt",
    re.I,
)
_EMAIL_IN_TEXT = re.compile(r"[\w.%+'\-]+@[\w\-]+(?:\.[\w\-]+)+")
_JWT_IN_TEXT = re.compile(r"eyJ[\w\-]{6,}\.[\w\-]{6,}\.[\w\-]*")
_BEARER_IN_TEXT = re.compile(r"\bbearer\s+[\w.~+/=\-]+", re.I)


def scrub_text(text: str) -> str:
    """Mask anything that looks like an email, JWT or bearer credential."""
    text = _EMAIL_IN_TEXT.sub("<email>", text)
    text = _JWT_IN_TEXT.sub("<jwt>", text)
    return _BEARER_IN_TEXT.sub("Bearer <redacted>", text)


class ScrubbingFormatter(logging.Formatter):
    """Text log formatter that masks emails / JWTs / bearer values inside tracebacks.

    Database driver errors embed the offending value ("Key (email)=(a@b.c) already
    exists"), so ``logger.exception()`` on a plain logger would print a customer's
    address. Only the traceback is scrubbed; ordinary messages stay readable.
    """

    def __init__(self, fmt=None, datefmt=None, style="%", *args, format=None, **kwargs):
        # ``format`` is accepted as an alias so LOGGING can keep its usual "format" key
        # (logging.config passes the dict keys of a "()" formatter as keyword arguments).
        super().__init__(fmt if fmt is not None else format, datefmt, style, *args, **kwargs)

    def formatException(self, ei):
        return scrub_text(super().formatException(ei))


def _clean(text: str) -> str:
    return scrub_text(text)[:_MAX_STR]


def _json_safe(value, depth: int = 0):
    """JSON-serialisable, scrubbed, size-bounded copy of ``value``; None = drop."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, str):
        return _clean(value)
    if isinstance(value, Enum):
        return _json_safe(value.value, depth)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return f"<{len(value)} bytes>"
    if depth < 2:
        if isinstance(value, dict):
            out = {}
            for key, item in list(value.items())[:_MAX_ITEMS]:
                key = str(key)[:60]
                if _SENSITIVE_KEY_RE.search(key):
                    continue
                safe = _json_safe(item, depth + 1)
                if safe is not None:
                    out[key] = safe
            return out
        if isinstance(value, (list, tuple, set, frozenset)):
            items = sorted(value, key=repr) if isinstance(value, (set, frozenset)) else value
            return [_json_safe(item, depth + 1) for item in list(items)[:_MAX_ITEMS]]
    return f"<{type(value).__name__}>"


def _json_default(obj):
    return f"<{type(obj).__name__}>"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# Fields the caller cannot override through **extra.
_RESERVED_KEYS = frozenset(
    {
        "event", "ts", "op", "outcome", "stage", "status", "endpoint", "method",
        "error_class", "user_id", "email_hash", "client_ip", "ua_family",
        "latency_ms", "cf_ray",
    }
)  # fmt: skip


def _put(event: dict, key: str, value) -> None:
    if value is None or value == "":
        return
    safe = _json_safe(value)
    if safe is not None and safe != "":
        event[key] = safe


def _build_event(request, op, outcome, stage, status, user, email, error, extra) -> dict:
    meta = getattr(request, "META", None)
    if not isinstance(meta, dict):
        meta = {}

    request_id = None
    for candidate in (
        extra.pop("request_id", None),  # explicit override, e.g. a Celery task
        getattr(request, "request_id", None),
        get_request_id(),
    ):
        if is_valid_request_id(candidate):
            request_id = candidate
            break

    cf_ray = meta.get("HTTP_CF_RAY")
    if not (isinstance(cf_ray, str) and _CF_RAY_RE.fullmatch(cf_ray)):
        cf_ray = None

    error_class = None
    if isinstance(error, BaseException):
        error_class = type(error).__name__
    elif isinstance(error, str):
        error_class = error

    latency_ms = None
    started = getattr(request, "_request_started_monotonic", None)
    if isinstance(started, (int, float)):
        latency_ms = max(0, int(round((time.monotonic() - started) * 1000)))

    throttle_scope = extra.pop("throttle_scope", None)
    if throttle_scope is None and outcome == "throttled":
        throttle_scope = getattr(request, "_throttle_scope", None)

    event = {"event": "auth", "ts": _utc_now_iso()}
    _put(event, "request_id", request_id)
    _put(event, "cf_ray", cf_ray)
    _put(event, "op", op)
    _put(event, "outcome", outcome)
    _put(event, "stage", stage)
    if isinstance(status, int) and not isinstance(status, bool):
        event["status"] = status
    _put(event, "endpoint", _path_of(request) if request is not None else None)
    _put(event, "method", getattr(request, "method", None))
    _put(event, "error_class", error_class)
    _put(event, "user_id", getattr(user, "pk", None))
    _put(event, "email_hash", hash_email(email) if email is not None else None)
    _put(event, "client_ip", get_client_ip(request) if request is not None else None)
    _put(event, "ua_family", classify_user_agent(meta.get("HTTP_USER_AGENT")) if meta else None)
    if latency_ms is not None:
        event["latency_ms"] = latency_ms
    _put(event, "throttle_scope", throttle_scope)

    for key, value in extra.items():
        if not isinstance(key, str) or key in _RESERVED_KEYS or _SENSITIVE_KEY_RE.search(key):
            continue
        safe = _json_safe(value)
        if safe is not None:
            event[key[:60]] = safe
    return event


def log_auth_event(
    request,
    op: str,
    outcome: str,
    *,
    stage: str | None = None,
    status: int | None = None,
    user=None,
    email: str | None = None,
    error: BaseException | None = None,
    level: int | None = None,
    **extra,
) -> None:
    """Write one compact JSON line describing an auth step to logger ``account.auth``.

    ``op``/``outcome``/``stage`` vocabulary and every field: docs/AUTH_OBSERVABILITY.md.
    Privacy: the raw email is only ever hashed; ``extra`` keys that look like
    credentials are dropped and string values are scrubbed of emails/JWTs and cut
    to 200 chars. ``request`` may be None (Celery tasks); pass ``request_id=`` in
    ``extra`` to tag such an event with the originating request. Never raises.
    """
    try:
        event = _build_event(request, op, outcome, stage, status, user, email, error, dict(extra))
        line = json.dumps(event, separators=(",", ":"), default=_json_default)
        if isinstance(level, int) and not isinstance(level, bool):
            log_level = level
        elif outcome == "error":
            log_level = logging.ERROR
        elif outcome == "throttled":
            log_level = logging.WARNING
        else:
            log_level = logging.INFO
        exc_info = None
        if outcome == "error" and isinstance(error, BaseException):
            exc_info = (type(error), error, error.__traceback__)
        # msg without args: never %-formatted, so "%" in values is safe.
        logging.getLogger(AUTH_EVENT_LOGGER).log(log_level, line, exc_info=exc_info)
    except Exception as exc:  # observability must never break auth
        try:
            logger.warning("Could not write auth event op=%s: %s", op, type(exc).__name__)
        except Exception:
            pass


class AuthEventFormatter(logging.Formatter):
    """``{message}``-only formatter for the JSON event stream.

    Tracebacks (``outcome="error"``) follow the JSON line as usual, but are
    scrubbed: driver errors such as IntegrityError embed the raw email.
    """

    def __init__(self, fmt="{message}", datefmt=None, style="{", **kwargs):
        super().__init__(fmt, datefmt, style, **kwargs)

    def formatException(self, ei) -> str:
        return scrub_text(super().formatException(ei))
