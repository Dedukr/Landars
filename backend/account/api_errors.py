"""Customer-safe error bodies for the auth API (contract: AUTH_FIX_PLAN.md section 4).

* ``error_response`` - the one way auth views build ``{"error", "code", "request_id", ...}``.
* ``exception_handler`` - ``REST_FRAMEWORK["EXCEPTION_HANDLER"]``. Only paths under
  ``/api/auth/`` are touched: throttling becomes a friendly 429 with a machine
  readable ``retry_after`` (and is logged as an auth event, because the view never
  runs), other dict bodies just gain ``request_id``. Everything else stays DRF's.
"""

from __future__ import annotations

import logging
import math

from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .observability import (
    get_request_id,
    is_auth_path,
    is_valid_request_id,
    log_auth_event,
    op_for_path,
)
from .throttles import request_email

logger = logging.getLogger(__name__)

DEFAULT_RETRY_AFTER = 60


def _request_id_for(request) -> str:
    candidate = getattr(request, "request_id", None)
    return candidate if is_valid_request_id(candidate) else get_request_id()


def error_response(request, message: str, *, code: str, status_code: int, **extra) -> Response:
    """``{"error": message, "code": code, "request_id": <id>, **extra}``."""
    body = {
        "error": message,
        "code": code,
        "request_id": _request_id_for(request),
        **extra,
    }
    return Response(body, status=status_code)


def throttled_message(wait: int) -> str:
    """Human wording; clients must branch on ``code``/``retry_after``, never on this."""
    if wait >= 120:
        return f"Too many attempts. Please wait about {math.ceil(wait / 60)} minutes and try again."
    unit = "second" if wait == 1 else "seconds"
    return f"Too many attempts. Please wait {wait} {unit} and try again."


def _friendly_throttled(exc: Throttled, request, response: Response) -> Response:
    wait = getattr(exc, "wait", None)
    retry_after = DEFAULT_RETRY_AFTER if wait is None else max(1, int(wait))
    message = throttled_message(retry_after)
    response.data = {
        "error": message,
        "detail": message,
        "code": "rate_limited",
        "retry_after": retry_after,
        "request_id": _request_id_for(request),
    }
    response["Retry-After"] = str(retry_after)

    op = op_for_path(getattr(request, "path_info", "") or "")
    email = ""
    if op != "client_event":
        try:
            # Hashed for the event so "was this customer throttled?" is answerable.
            email = request_email(request)
        except Exception:
            email = ""
    extra = {"retry_after": retry_after}
    scopes = getattr(request, "_throttle_scopes", None)
    if isinstance(scopes, list) and len(scopes) > 1:
        extra["throttle_scopes"] = scopes
    log_auth_event(
        request,
        op,
        "throttled",
        stage="rate_limit",
        status=429,
        email=email or None,
        throttle_scope=getattr(request, "_throttle_scope", None),
        **extra,
    )
    return response


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    try:
        request = (context or {}).get("request")
        if request is None or not is_auth_path(request):
            return response
        if isinstance(exc, Throttled):
            return _friendly_throttled(exc, request, response)
        if isinstance(response.data, dict):
            response.data.setdefault("request_id", _request_id_for(request))
    except Exception:
        logger.warning("Could not post-process API error response", exc_info=True)
    return response
