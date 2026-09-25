"""Auth-endpoint throttles: fail-open, rates read at call time.

* IP keys use ``BaseThrottle.get_ident`` (``NUM_PROXIES``), the same address the
  auth events log as ``client_ip``. Behind Cloudflare -> nginx that is the real
  visitor only when nginx restores it (``set_real_ip_from``); see
  docs/AUTH_OBSERVABILITY.md.
* Register and verification-resend also key a hashed normalised email so people
  behind one office / CGNAT / Cloudflare edge do not share one tiny bucket.
* Rates come from Django settings on every request (``get_rate``), never from
  class attributes, so ``override_settings`` and env changes behave; a malformed
  value falls back to the default instead of turning every request into a 500.
* A cache/Redis failure allows the request (a broken limiter must not lock
  customers out). Redis socket timeouts (settings.CACHES) bound how long that
  check can take.
* A denial records the scope on ``request._throttle_scope`` for the 429 handler
  in ``account.api_errors``.
"""

from __future__ import annotations

import ipaddress
import logging

from django.conf import settings
from rest_framework.exceptions import APIException
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from .email_normalization import normalize_email
from .observability import hash_email

logger = logging.getLogger(__name__)


def request_email(request) -> str:
    """Normalised ``email`` of a JSON request body, "" if absent or unusable.

    Non-dict bodies and non-string emails yield "". DRF parse errors propagate on
    purpose so the client gets the usual 400. There is deliberately no body-size
    shortcut: padding a request must not switch the per-email limiter off (nginx
    caps ``/api/auth/`` bodies at 16 KB before they reach Django).
    """
    data = getattr(request, "data", None)
    if not hasattr(data, "get"):
        return ""
    return normalize_email(data.get("email"))


class _FailOpenRateMixin:
    """Call-time rate resolution, fail-open behaviour and denial bookkeeping."""

    rate_setting: str | None = None  # name of the Django setting holding "N/period"
    default_rate: str | None = None

    def get_rate(self):
        if not self.rate_setting:
            return super().get_rate()
        configured = getattr(settings, self.rate_setting, None)
        if configured:
            try:
                num, _duration = self.parse_rate(configured)
                if num is not None and num >= 0:
                    return configured
            except Exception:
                pass
            logger.warning(
                "Ignoring invalid %s=%r - using default %s",
                self.rate_setting,
                configured,
                self.default_rate,
            )
        return self.default_rate

    def get_ident(self, request):
        """Client address as a throttle key; IPv6 is bucketed per /64.

        A single IPv6 subscriber controls a whole /64 and can rotate addresses at will,
        which would otherwise give them an unlimited number of fresh buckets.
        """
        ident = super().get_ident(request)
        try:
            ip = ipaddress.ip_address(ident)
        except ValueError:
            return ident
        if ip.version == 6:
            if ip.ipv4_mapped is not None:
                return str(ip.ipv4_mapped)
            return f"{ipaddress.ip_network(f'{ip}/64', strict=False).network_address}/64"
        return ident

    def allow_request(self, request, view):
        try:
            allowed = super().allow_request(request, view)
        except APIException:
            raise  # e.g. malformed JSON body: let DRF answer 400 as it always did
        except Exception:
            logger.warning(
                "Throttle cache unavailable for %s - allowing request",
                self.scope,
                exc_info=True,
            )
            return True
        if not allowed:
            self._remember_denial(request)
        return allowed

    def _remember_denial(self, request) -> None:
        """Expose which scope(s) rejected the request; longest wait = primary."""
        try:
            wait = self.wait() or 0
            if wait >= getattr(request, "_throttle_scope_wait", -1):
                request._throttle_scope = self.scope
                request._throttle_scope_wait = wait
            request._throttle_scopes = [
                *getattr(request, "_throttle_scopes", []),
                self.scope,
            ]
        except Exception:
            logger.debug("Could not record throttle scope", exc_info=True)


class FailOpenAnonRateThrottle(_FailOpenRateMixin, AnonRateThrottle):
    """Per-IP limit for unauthenticated requests."""


class FailOpenUserRateThrottle(_FailOpenRateMixin, UserRateThrottle):
    """Per-user limit (per-IP for anonymous requests)."""


def _hashed_email_cache_key(throttle, request) -> str | None:
    """Redis key ident is the client address plus ``hash_email`` (never the raw address).

    Deliberately NOT the email alone: with an email-only key anyone could exhaust a
    victim's sign-up / reset / resend allowance for an hour by hammering it with the
    victim's address (the login limiter is keyed the same way for the same reason). An
    attacker's requests now only fill their own (IP, email) bucket; the per-IP limits
    bound how many different addresses one client can mail.
    """
    digest = hash_email(request_email(request))
    if not digest:
        return None
    return throttle.cache_format % {
        "scope": throttle.scope,
        "ident": f"{throttle.get_ident(request)}_{digest}",
    }


class RegisterThrottle(FailOpenAnonRateThrottle):
    """Per-IP flood guard (each address is separately capped per email by ``RegisterEmailThrottle``)."""

    scope = "register"
    rate_setting = "REGISTER_RATE_LIMIT"
    default_rate = "300/hour"


class RegisterEmailThrottle(FailOpenAnonRateThrottle):
    """Per (client IP, normalised email) cap: one client cannot hammer register with one address."""

    scope = "register_email"
    rate_setting = "REGISTER_EMAIL_RATE_LIMIT"
    default_rate = "8/hour"

    def get_cache_key(self, request, view):
        return _hashed_email_cache_key(self, request)


class LoginThrottle(FailOpenAnonRateThrottle):
    scope = "login"
    rate_setting = "LOGIN_RATE_LIMIT"
    default_rate = "20/minute"


class LoginEmailThrottle(FailOpenAnonRateThrottle):
    """Per (client IP, email) limit: slows password guessing on one account
    without letting one IP lock the real owner out from another address.
    The email only enters the cache key as ``hash_email`` (no PII in Redis).
    No usable email in the body -> no key -> not throttled here.
    """

    scope = "login_email"
    rate_setting = "LOGIN_EMAIL_RATE_LIMIT"
    default_rate = "8/minute"

    def get_cache_key(self, request, view):
        digest = hash_email(request_email(request))
        if not digest:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{self.get_ident(request)}_{digest}",
        }


class PasswordResetThrottle(FailOpenAnonRateThrottle):
    """High per-IP cap (NAT / office). Per-inbox cap is PasswordResetEmailThrottle."""

    scope = "password_reset"
    rate_setting = "PASSWORD_RESET_RATE_LIMIT"
    default_rate = "100/hour"


class PasswordResetEmailThrottle(FailOpenAnonRateThrottle):
    """Per (client IP, normalised email) cap on reset mail (hashed in the cache key)."""

    scope = "password_reset_email"
    rate_setting = "PASSWORD_RESET_EMAIL_RATE_LIMIT"
    default_rate = "8/hour"

    def get_cache_key(self, request, view):
        return _hashed_email_cache_key(self, request)


class EmailVerificationThrottle(FailOpenAnonRateThrottle):
    """High per-IP cap: distinct customers verifying behind one NAT must not collide."""

    scope = "email_verify"
    rate_setting = "EMAIL_VERIFICATION_RATE_LIMIT"
    default_rate = "1000/hour"


class EmailVerificationResendThrottle(FailOpenAnonRateThrottle):
    """Per (client IP, normalised email) cap on resend mail (hashed in the cache key)."""

    scope = "email_resend"
    rate_setting = "EMAIL_VERIFICATION_RESEND_RATE_LIMIT"
    default_rate = "12/hour"

    def get_cache_key(self, request, view):
        return _hashed_email_cache_key(self, request)


class EmailVerificationResendIpThrottle(FailOpenAnonRateThrottle):
    """Per-IP flood guard: bots spraying random addresses are slowed down, NAT users are not."""

    scope = "email_resend_ip"
    rate_setting = "EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT"
    default_rate = "300/hour"


class ClientEventThrottle(FailOpenAnonRateThrottle):
    scope = "client_event"
    rate_setting = "CLIENT_EVENT_RATE_LIMIT"
    default_rate = "60/minute"
