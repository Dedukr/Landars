"""httpOnly refresh-token cookie helpers (XSS hardening for JWT refresh)."""

from datetime import timedelta

from django.conf import settings
from rest_framework.response import Response


def refresh_cookie_name() -> str:
    return getattr(settings, "JWT_REFRESH_COOKIE_NAME", "refresh_token")


def refresh_cookie_path() -> str:
    return getattr(settings, "JWT_REFRESH_COOKIE_PATH", "/api/auth/")


def refresh_cookie_samesite() -> str:
    return getattr(settings, "JWT_REFRESH_COOKIE_SAMESITE", "Lax")


def _refresh_cookie_max_age() -> int:
    lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=7))
    if isinstance(lifetime, timedelta):
        return int(lifetime.total_seconds())
    return int(lifetime)


def _refresh_cookie_secure() -> bool:
    return getattr(
        settings,
        "JWT_REFRESH_COOKIE_SECURE",
        not settings.DEBUG,
    )


def set_refresh_cookie(response: Response, refresh_token: str) -> Response:
    """Attach the refresh JWT as an httpOnly cookie (not readable by JS)."""
    response.set_cookie(
        key=refresh_cookie_name(),
        value=refresh_token,
        max_age=_refresh_cookie_max_age(),
        httponly=True,
        secure=_refresh_cookie_secure(),
        samesite=refresh_cookie_samesite(),
        path=refresh_cookie_path(),
    )
    return response


def clear_refresh_cookie(response: Response) -> Response:
    """Expire the refresh cookie with attributes matching set_refresh_cookie.

    Django 5.2's delete_cookie() only sets Secure for __Secure-/__Host- names or
    SameSite=None, so a Secure=True Lax refresh cookie would not clear in browsers.
    Expire via set_cookie with the same path/samesite/secure/httponly instead.
    """
    response.set_cookie(
        key=refresh_cookie_name(),
        value="",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
        httponly=True,
        secure=_refresh_cookie_secure(),
        samesite=refresh_cookie_samesite(),
        path=refresh_cookie_path(),
    )
    return response


def get_refresh_from_request(request) -> str | None:
    """Prefer body refresh (legacy/clients), else httpOnly cookie."""
    body_token = None
    if hasattr(request, "data"):
        body_token = request.data.get("refresh")
    if body_token:
        return body_token
    return request.COOKIES.get(refresh_cookie_name())
