"""Helpers for customer-facing auth URLs (verification, password reset)."""

import logging
from urllib.parse import urlparse

from django.conf import settings

logger = logging.getLogger("account")


def _is_localhost_origin(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host in ("localhost", "127.0.0.1", "::1") or host.endswith(".localhost")


def get_public_frontend_base_url() -> str:
    """
    Origin used in emails (verify / reset links).

    Prefer FRONTEND_URL, then URL_BASE. Never rewrite to :3000 — in Docker/prod
    the marketplace is served via nginx on the public origin, not host port 3000.

    When DEBUG=False and the resolved origin is localhost, log an error so ops
    can set FRONTEND_URL to the public site (e.g. https://landarsfood.com).
    Localhost links still return as configured so we do not invent a production
    domain from incomplete settings.
    """
    resolved = "https://localhost"
    for candidate in (
        getattr(settings, "FRONTEND_URL", None),
        getattr(settings, "URL_BASE", None),
        getattr(settings, "SITE_URL", None),
    ):
        if candidate and str(candidate).strip():
            resolved = str(candidate).strip().rstrip("/")
            break

    if not getattr(settings, "DEBUG", True) and _is_localhost_origin(resolved):
        logger.error(
            "FRONTEND_URL/URL_BASE resolves to localhost (%s) while DEBUG=False. "
            "Verification and password-reset emails will contain broken links. "
            "Set FRONTEND_URL to the public origin (e.g. https://landarsfood.com).",
            resolved,
        )

    return resolved
