"""Helpers for customer-facing auth URLs (verification, password reset)."""

from django.conf import settings


def get_public_frontend_base_url() -> str:
    """
    Origin used in emails (verify / reset links).

    Prefer FRONTEND_URL, then URL_BASE. Never rewrite to :3000 — in Docker/prod
    the marketplace is served via nginx on the public origin, not host port 3000.
    """
    for candidate in (
        getattr(settings, "FRONTEND_URL", None),
        getattr(settings, "URL_BASE", None),
        getattr(settings, "SITE_URL", None),
    ):
        if candidate and str(candidate).strip():
            return str(candidate).strip().rstrip("/")
    return "https://localhost"
