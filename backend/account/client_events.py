"""Browser failure beacon: ``POST /api/auth/client-event/``.

When a sign-in / sign-up / refresh call fails in the browser without a usable
server answer (offline, timeout, HTML error page from a proxy, ...) the SPA
reports it here so operators can see it next to the server-side auth events.

Anonymous, no CSRF, throttled, body <= 2 KB. Validation is strict and only
whitelisted values or validated tokens are ever logged - never raw client
strings, cookies, tokens or emails. Success is a bodiless 204.
"""

from __future__ import annotations

import json
import re

from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .api_errors import error_response
from .observability import is_valid_request_id, log_auth_event
from .throttles import ClientEventThrottle

MAX_BODY_BYTES = 2048
MAX_PATH_LENGTH = 80

ALLOWED_OPS = frozenset(
    {"login", "register", "refresh", "verify", "resend", "reset", "restore"}
)
ALLOWED_STAGES = frozenset(
    {
        "network",
        "timeout",
        "http",
        "parse",
        "csrf",
        "refresh_rejected",
        "refresh_transient",
        "restore_transient",
    }
)
_ERROR_RE = re.compile(r"[A-Za-z0-9_. -]{0,40}")
_PATH_RE = re.compile(r"/api/auth/[A-Za-z0-9/_-]*")


def _validate(payload) -> tuple[dict | None, str | None]:
    """Return ``(clean_fields, None)`` or ``(None, offending_field_name)``."""
    if not isinstance(payload, dict):
        return None, "body"

    op = payload.get("op")
    if not isinstance(op, str) or op not in ALLOWED_OPS:
        return None, "op"
    stage = payload.get("stage")
    if not isinstance(stage, str) or stage not in ALLOWED_STAGES:
        return None, "stage"

    status = payload.get("status")
    if status is not None and (
        isinstance(status, bool) or not isinstance(status, int) or not 0 <= status <= 599
    ):
        return None, "status"

    error = payload.get("error")
    if error is not None and not (
        isinstance(error, str) and _ERROR_RE.fullmatch(error)
    ):
        return None, "error"

    online = payload.get("online")
    if online is not None and not isinstance(online, bool):
        return None, "online"

    request_id = payload.get("request_id")
    if request_id is not None and not is_valid_request_id(request_id):
        return None, "request_id"

    path = payload.get("path")
    if path is not None:
        if not isinstance(path, str):
            return None, "path"
        # A query string may carry a reset/verification token: cut it off before
        # anything is validated or logged.
        path = re.split(r"[?#]", path, maxsplit=1)[0]
        if len(path) > MAX_PATH_LENGTH or not _PATH_RE.fullmatch(path):
            return None, "path"

    return {
        "client_op": op,
        "client_stage": stage,
        "client_status": status,
        "client_error": error or None,
        "client_online": online,
        "client_request_id": request_id,
        "client_path": path,
    }, None


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ClientEventThrottle])
def client_event(request):
    try:
        length = int(request.META.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        length = 0
    if length > MAX_BODY_BYTES:
        return error_response(
            request,
            "Request body too large.",
            code="payload_too_large",
            status_code=413,
        )

    # Parsed by hand (not request.data): navigator.sendBeacon(string) posts
    # text/plain, which the JSON-only DRF parser would answer with 415.
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        payload = None

    fields, bad_field = _validate(payload)
    if fields is None:
        log_auth_event(
            request,
            "client_event",
            "rejected",
            stage="validation",
            status=400,
            field=bad_field,
        )
        return error_response(
            request,
            "Invalid client event.",
            code="validation_error",
            status_code=400,
            field=bad_field,
        )

    log_auth_event(request, "client_event", "success", status=204, **fields)
    return Response(status=204)
