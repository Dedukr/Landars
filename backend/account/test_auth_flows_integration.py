"""End-to-end customer-authentication flows through the real HTTP API (SQLite-safe).

Unit-level cases live in ``test_auth_regressions*.py``; these tests drive whole customer
journeys the way a browser does:

* ``BrowserSim`` is a tiny browser: a cookie jar that honours ``Path``, ``HttpOnly``
  (``js_cookies()`` never shows them) and ``Max-Age=0`` deletions, an in-memory access
  token, and the ``httpClient.ts`` CSRF dance (GET ``/api/auth/csrf-token/``, echo the
  token in ``X-CSRFToken``). Two ``Tab`` objects may share one jar ("two tabs").
* Verification / reset mails are really rendered (the Celery ``.delay`` of each task is
  replaced by an eager ``.apply`` and Django's locmem mail backend collects the result),
  so the tests click the very link a customer would receive.
* Every response is checked for ``X-Request-ID`` and (under ``/api/auth/``) for
  ``Cache-Control: no-store``, and error bodies must echo the same request id.

Real multi-thread races on PostgreSQL live in ``test_auth_concurrency_postgres.py``.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone as dt_timezone
from email.utils import parsedate_to_datetime
from io import StringIO
from unittest.mock import patch

import jwt as pyjwt
from django.contrib.auth.hashers import make_password
from django.core import mail
from django.core.cache import cache
from django.core.cache.backends.locmem import LocMemCache
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from account import tasks as account_tasks
from account.models import CustomUser, EmailVerificationToken, PasswordResetToken
from account.observability import AuthEventFormatter, hash_email

User = CustomUser

API = "/api/auth/"
REGISTER, LOGIN, LOGOUT = API + "register/", API + "login/", API + "logout/"
REFRESH, TOKEN, PROFILE = API + "token/refresh/", API + "token/", API + "profile/"
PROFILE_UPDATE, CSRF = API + "profile/update/", API + "csrf-token/"
VERIFY, RESEND = API + "verify-email/", API + "resend-verification/"
RESET, RESET_CONFIRM = API + "password-reset/", API + "password-reset/confirm/"
RESET_VALIDATE, CLIENT_EVENT = API + "password-reset/validate/", API + "client-event/"

PASSWORD = "SecurePass1"
NEW_PASSWORD = "BrandNewPass9"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
NGINX_CONTAINER_IP = "172.18.0.2"
REFRESH_COOKIE, CSRF_COOKIE = "refresh_token", "csrftoken"

# Throttles are exercised by their own tests; every other flow runs unthrottled.
NO_THROTTLE = dict(
    REGISTER_RATE_LIMIT="1000/hour",
    REGISTER_EMAIL_RATE_LIMIT="1000/hour",
    LOGIN_RATE_LIMIT="1000/minute",
    LOGIN_EMAIL_RATE_LIMIT="1000/minute",
    PASSWORD_RESET_RATE_LIMIT="1000/hour",
    PASSWORD_RESET_EMAIL_RATE_LIMIT="1000/hour",
    EMAIL_VERIFICATION_RATE_LIMIT="1000/hour",
    EMAIL_VERIFICATION_RESEND_RATE_LIMIT="1000/hour",
    EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT="1000/hour",
    CLIENT_EVENT_RATE_LIMIT="1000/minute",
)
PROD_LIKE = dict(
    FRONTEND_URL="https://shop.example.test",
    JWT_REFRESH_COOKIE_SECURE=True,
    JWT_REFRESH_COOKIE_SAMESITE="Lax",
    JWT_REFRESH_ROTATION_GRACE_SECONDS=30,
    # PBKDF2 makes every login cost ~0.2 s; the hasher is not what these tests are about.
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)

VERIFY_LINK = re.compile(r"https://shop\.example\.test/verify-email\?token=([A-Za-z0-9_\-]+)")
RESET_LINK = re.compile(r"https://shop\.example\.test/reset-password\?token=([A-Za-z0-9_\-]+)")
REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

# One mailbox, spelled the way real customers (and copy/paste) spell it.
EMAIL = "user@example.com"
EMAIL_VARIANTS = [
    "user@example.com",
    "  User@Example.COM  ",
    "user@example.com\u200b",  # zero-width space (copy/paste from chat apps)
    "\ufeffuser@example.com",  # BOM
    "USER@EXAMPLE.COM\u2060",  # word joiner
    "\u00a0user@example.com\u00a0",  # NBSP (mobile keyboards)
    "\uff55\uff53\uff45\uff52\uff20\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45\uff0e\uff43\uff4f\uff4d",
]


# ----------------------------------------------------------------------------------
# Browser simulation
# ----------------------------------------------------------------------------------


class CookieJar:
    """RFC 6265-ish jar shared by the tabs of one browser profile."""

    def __init__(self):
        self._cookies: dict[tuple[str, str], dict] = {}

    def absorb(self, response) -> None:
        for name, morsel in response.cookies.items():
            path = morsel["path"] or "/"
            expired = False
            if morsel["max-age"] != "":
                expired = int(morsel["max-age"]) <= 0
            elif morsel["expires"]:
                expired = parsedate_to_datetime(morsel["expires"]) <= datetime.now(dt_timezone.utc)
            if expired:
                self._cookies.pop((name, path), None)
                continue
            self._cookies[(name, path)] = {
                "value": morsel.value,
                "path": path,
                "httponly": bool(morsel["httponly"]),
                "secure": bool(morsel["secure"]),
                "samesite": morsel["samesite"],
            }

    @staticmethod
    def _path_matches(cookie_path: str, request_path: str) -> bool:
        if request_path == cookie_path:
            return True
        return request_path.startswith(cookie_path) and (
            cookie_path.endswith("/") or request_path[len(cookie_path)] == "/"
        )

    def for_request(self, request_path: str) -> dict[str, str]:
        return {
            name: c["value"]
            for (name, _), c in self._cookies.items()
            if self._path_matches(c["path"], request_path)
        }

    def snapshot(self) -> dict:
        return {key: dict(value) for key, value in self._cookies.items()}

    def js_cookies(self) -> dict[str, str]:
        """``document.cookie``: everything except HttpOnly cookies."""
        return {n: c["value"] for (n, _), c in self._cookies.items() if not c["httponly"]}

    def value(self, name: str):
        for (n, _), c in self._cookies.items():
            if n == name:
                return c["value"]
        return None

    def attrs(self, name: str):
        for (n, _), c in self._cookies.items():
            if n == name:
                return c
        return None

    def put(self, name: str, value: str, *, path: str = "/api/auth/", httponly: bool = True):
        """Test hook: a cookie the browser holds from earlier (or that got corrupted)."""
        self._cookies[(name, path)] = {
            "value": value, "path": path, "httponly": httponly, "secure": True, "samesite": "Lax",
        }

    def drop(self, name: str) -> None:
        for key in [k for k in self._cookies if k[0] == name]:
            del self._cookies[key]


class Reply:
    def __init__(self, response, path):
        self.raw, self.path = response, path
        self.status = response.status_code
        self.cookies = response.cookies
        try:
            self.json = response.json()
        except Exception:
            self.json = None

    def __getitem__(self, key):
        return self.raw[key]

    @property
    def code(self):
        return self.json.get("code") if isinstance(self.json, dict) else None

    @property
    def request_id(self):
        return self.raw["X-Request-ID"]

    def set_cookie(self, name):
        return self.cookies.get(name)


class Tab:
    """One browser tab: private in-memory access token; the cookie jar may be shared."""

    def __init__(self, case, jar=None, *, ip="198.51.100.10"):
        self.case, self.jar, self.ip = case, jar if jar is not None else CookieJar(), ip
        self.access = None
        self.csrf_token = None
        self.replies: list[Reply] = []

    # -- transport -----------------------------------------------------------------
    def request(self, method, path, body=None, *, bearer=True, headers=None, cookies=None, csrf=None):
        client = APIClient(enforce_csrf_checks=True)
        jar_cookies = self.jar.for_request(path) if cookies is None else cookies
        for name, value in jar_cookies.items():
            client.cookies[name] = value
        extra = {
            "REMOTE_ADDR": NGINX_CONTAINER_IP,
            "HTTP_X_FORWARDED_FOR": f"{self.ip}, {self.ip}",
            "HTTP_USER_AGENT": UA,
        }
        if bearer is True:
            if self.access:
                extra["HTTP_AUTHORIZATION"] = f"Bearer {self.access}"
        elif isinstance(bearer, str):
            extra["HTTP_AUTHORIZATION"] = bearer
        if csrf:
            extra["HTTP_X_CSRFTOKEN"] = csrf
        for key, value in (headers or {}).items():
            extra[key] = value
        call = getattr(client, method.lower())
        response = call(path, **({"data": body if body is not None else {}, "format": "json"}
                                 if method.upper() != "GET" else {"data": body}), **extra)
        reply = Reply(response, path)
        self.jar.absorb(response)
        self.replies.append(reply)
        self._check_contract(reply)
        return reply

    def _check_contract(self, reply):
        tc = self.case
        tc.assertRegex(reply["X-Request-ID"], REQUEST_ID, f"{reply.path}: X-Request-ID")
        if reply.path.startswith(API):
            tc.assertIn("no-store", reply["Cache-Control"], f"{reply.path}: Cache-Control")
            if reply.status >= 400 and isinstance(reply.json, dict):
                tc.assertEqual(
                    reply.json.get("request_id"), reply.request_id,
                    f"{reply.path}: error body must echo the request id ({reply.json})",
                )

    # -- httpClient.ts behaviour ---------------------------------------------------
    def fetch_csrf(self) -> str:
        reply = self.request("GET", CSRF, bearer=False)
        self.case.assertEqual(reply.status, 200)
        self.csrf_token = reply.json["csrfToken"]
        return self.csrf_token

    def reset_csrf(self) -> None:
        self.csrf_token = None

    def refresh(self, cookies=None) -> Reply:
        """POST /token/refresh/ exactly like httpClient: cached CSRF token, no Authorization,
        one reset-and-retry on a CSRF 403. ``cookies`` pins what the browser attached."""
        token = self.csrf_token or self.fetch_csrf()
        reply = self.request("POST", REFRESH, {}, bearer=False, csrf=token, cookies=cookies)
        if reply.status == 403:
            self.reset_csrf()
            reply = self.request("POST", REFRESH, {}, bearer=False, csrf=self.fetch_csrf(), cookies=cookies)
        if reply.status == 200:
            self.access = reply.json["access"]
        return reply

    # -- API verbs -----------------------------------------------------------------
    def register(self, email=EMAIL, password=PASSWORD, first="Ada", surname="Lovelace", **extra):
        return self.request(
            "POST", REGISTER,
            {"email": email, "password": password, "first_name": first, "surname": surname, **extra},
            bearer=False,
        )

    def login(self, email=EMAIL, password=PASSWORD) -> Reply:
        reply = self.request("POST", LOGIN, {"email": email, "password": password}, bearer=False)
        if reply.status == 200 and isinstance(reply.json, dict) and reply.json.get("access"):
            self.access = reply.json["access"]
        return reply

    def logout(self, **kwargs) -> Reply:
        reply = self.request("POST", LOGOUT, {}, **kwargs)
        self.access = None
        return reply

    def profile(self, **kwargs) -> Reply:
        return self.request("GET", PROFILE, **kwargs)

    def verify(self, token) -> Reply:
        reply = self.request("POST", VERIFY, {"token": token}, bearer=False)
        if reply.status == 200 and isinstance(reply.json, dict) and reply.json.get("access"):
            self.access = reply.json["access"]
        return reply

    def resend(self, email=EMAIL) -> Reply:
        return self.request("POST", RESEND, {"email": email}, bearer=False)

    def reset_request(self, email=EMAIL) -> Reply:
        return self.request("POST", RESET, {"email": email}, bearer=False)

    def reset_confirm(self, token, password=NEW_PASSWORD) -> Reply:
        return self.request("POST", RESET_CONFIRM, {"token": token, "new_password": password}, bearer=False)

    def update_profile(self, **fields) -> Reply:
        return self.request("PATCH", PROFILE_UPDATE, fields)


# ----------------------------------------------------------------------------------
# Shared fixtures
# ----------------------------------------------------------------------------------

_EAGER_TASKS = {
    "verify": "send_verification_email_task",
    "confirm": "send_verification_confirmation_email_task",
    "reset": "send_password_reset_email_task",
    "reset_confirm": "send_password_reset_confirmation_email_task",
}


def make_user(email=EMAIL, *, verified=True, password=PASSWORD, **extra):
    return User.objects.create_user(
        email=email, password=password, first_name="Test", surname="User",
        is_email_verified=verified, **extra,
    )


def make_legacy_duplicates(lower_password="LowerPass1", mixed_password="MixedPass1"):
    """Two case-variant rows as found in old databases (bypasses save()/clean())."""
    return User.objects.bulk_create([
        User(email="dup@example.com", password=make_password(lower_password),
             first_name="Low", surname="Er", is_email_verified=True),
        User(email="Dup@Example.com", password=make_password(mixed_password),
             first_name="Mix", surname="Ed", is_email_verified=True),
    ])


def events_from(lines, op=None):
    events = []
    for name, text in lines:
        if name != "account.auth":
            continue
        try:
            event = json.loads(text.split("\n", 1)[0])
        except ValueError:
            continue
        if op is None or event.get("op") == op:
            events.append(event)
    return events


class LogTap(logging.Handler):
    """Captures every record the production handlers would print, formatted like them
    (auth events through ``AuthEventFormatter``, everything else with a plain formatter,
    both including exception text)."""

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.lines: list[tuple[str, str]] = []
        self._auth = AuthEventFormatter()
        self._plain = logging.Formatter("{levelname} {name} {message}", style="{")

    def emit(self, record):
        formatter = self._auth if record.name == "account.auth" else self._plain
        try:
            self.lines.append((record.name, formatter.format(record)))
        except Exception:  # pragma: no cover
            self.lines.append((record.name, record.getMessage()))

    def text(self) -> str:
        return "\n".join(text for _, text in self.lines)

    def __enter__(self):
        self._saved = []
        for name in ("", "account.auth"):
            logger = logging.getLogger(name)
            self._saved.append((logger, logger.level))
            logger.addHandler(self)
            if name == "":
                logger.setLevel(min(logger.level or logging.INFO, logging.INFO))
        return self

    def __exit__(self, *exc):
        for logger, level in self._saved:
            logger.removeHandler(self)
            logger.setLevel(level)


@override_settings(**NO_THROTTLE, **PROD_LIKE)
class AuthFlowCase(TransactionTestCase):
    """TransactionTestCase: register/resend/reset publish their Celery task in
    ``transaction.on_commit`` and the verify view reads rows under ``select_for_update``."""

    def setUp(self):
        cache.clear()
        self.mocks = {}
        for key, task_name in _EAGER_TASKS.items():
            patcher = patch(f"account.views.{task_name}.delay", side_effect=self._eager(task_name))
            self.mocks[key] = patcher.start()
            self.addCleanup(patcher.stop)

    @staticmethod
    def _eager(task_name):
        def run(*args, **kwargs):
            return getattr(account_tasks, task_name).apply(args=args, kwargs=kwargs)
        return run

    def broker_down(self, key="verify"):
        self.mocks[key].side_effect = ConnectionError("broker down")

    def broker_up(self, key="verify"):
        self.mocks[key].side_effect = self._eager(_EAGER_TASKS[key])

    def tab(self, jar=None, **kwargs) -> Tab:
        return Tab(self, jar, **kwargs)

    # -- mail ----------------------------------------------------------------------
    def mails(self, kind):
        pattern = VERIFY_LINK if kind == "verify" else RESET_LINK
        return [m for m in mail.outbox if pattern.search(m.body)]

    def link_token(self, kind, index=-1, to=None) -> str:
        """Token from the rendered mail body; the HTML alternative must carry the same link."""
        pattern = VERIFY_LINK if kind == "verify" else RESET_LINK
        messages = self.mails(kind)
        if to is not None:
            messages = [m for m in messages if m.to == [to]]
        self.assertTrue(messages, f"no {kind} mail in outbox ({[m.subject for m in mail.outbox]})")
        message = messages[index]
        token = pattern.search(message.body).group(1)
        html = next((body for body, mime in message.alternatives if mime == "text/html"), "")
        if html:
            self.assertIn(token, html)
        return token

    def age_verification_mail(self, seconds=180):
        """The customer waits out the resend cooldown."""
        EmailVerificationToken.objects.filter(email_sent_at__isnull=False).update(
            email_sent_at=timezone.now() - timedelta(seconds=seconds)
        )
        cache.clear()

    def sign_up_and_verify(self, tab=None, email=EMAIL, password=PASSWORD):
        tab = tab or self.tab()
        self.assertEqual(tab.register(email, password).status, 201)
        self.assertEqual(tab.verify(self.link_token("verify")).status, 200)
        return tab

    def assertRefreshCookieIsSafe(self, reply):
        morsel = reply.set_cookie(REFRESH_COOKIE)
        self.assertIsNotNone(morsel, "refresh cookie was not set")
        self.assertTrue(morsel["httponly"])
        self.assertTrue(morsel["secure"])
        self.assertEqual(morsel["samesite"], "Lax")
        self.assertEqual(morsel["path"], "/api/auth/")
        self.assertEqual(int(morsel["max-age"]), 7 * 24 * 3600)


def expired_token(user, cls=AccessToken, hours_ago=2):
    token = cls.for_user(user)
    token.set_exp(from_time=timezone.now() - timedelta(hours=hours_ago), lifetime=timedelta(hours=1))
    return str(token)


def _access_like_jwt(user_id, signing_key):
    """HS256 access-shaped JWT signed with ``signing_key`` (not necessarily SIGNING_KEY)."""
    raw = pyjwt.encode(
        {
            "token_type": "access",
            "user_id": user_id,
            "exp": int((timezone.now() + timedelta(hours=1)).timestamp()),
        },
        signing_key,
        algorithm="HS256",
    )
    return raw.decode("ascii") if isinstance(raw, bytes) else raw


def jti_of(raw):
    return pyjwt.decode(raw, options={"verify_signature": False})["jti"]


# ----------------------------------------------------------------------------------
# a / b / c / d: sign-up journeys
# ----------------------------------------------------------------------------------


class SignUpJourneyTests(AuthFlowCase):
    def test_a_signup_verify_login_profile_refresh_logout_three_cycles(self):
        tab = self.tab()
        registered = tab.register("  Ada.Lovelace@Example.com ")
        self.assertEqual(registered.status, 201, registered.json)
        self.assertTrue(registered.json["email_verification_required"])
        self.assertTrue(registered.json["email_queued"])
        self.assertFalse(registered.json["resumed"])
        self.assertNotIn("access", registered.json)
        self.assertIsNone(registered.set_cookie(REFRESH_COOKIE))
        user = User.objects.get()
        self.assertEqual(user.email, "ada.lovelace@example.com")
        self.assertFalse(user.is_email_verified)

        self.assertEqual(len(mail.outbox), 1)
        token = self.link_token("verify", to="ada.lovelace@example.com")
        row = EmailVerificationToken.objects.get(user=user)
        self.assertEqual(row.token, token)
        self.assertIsNotNone(row.email_sent_at)  # the task really delivered it

        verified = tab.verify(token)
        self.assertEqual((verified.status, verified.json["already_verified"]), (200, False))
        self.assertNotIn("access", verified.json)  # verifying an address never signs in
        self.assertNotIn("refresh", verified.json)
        self.assertIsNone(verified.set_cookie(REFRESH_COOKIE))
        self.assertTrue(User.objects.get().is_email_verified)
        self.assertEqual(len(mail.outbox), 2)  # welcome mail
        # An e-mail scanner / double click re-opens the link: still a success.
        again = tab.verify(token)
        self.assertEqual((again.status, again.json["already_verified"]), (200, True))
        # ... but a replay never signs anyone in (the first use already did).
        self.assertNotIn("access", again.json)
        self.assertIsNone(again.set_cookie(REFRESH_COOKIE))
        tab.logout()

        seen_cookies = set()
        for cycle in range(3):
            with self.subTest(cycle=cycle):
                login = tab.login("ada.lovelace@example.com")
                self.assertEqual(login.status, 200, login.json)
                self.assertRefreshCookieIsSafe(login)
                self.assertNotIn(REFRESH_COOKIE, tab.jar.js_cookies())  # HttpOnly: invisible to JS
                self.assertNotIn("refresh", login.json)
                first_cookie = tab.jar.value(REFRESH_COOKIE)
                seen_cookies.add(first_cookie)

                profile = tab.profile()
                self.assertEqual(profile.status, 200, profile.json)
                self.assertEqual(profile.json["user"]["email"], "ada.lovelace@example.com")

                old_access = tab.access
                rotated = tab.refresh()
                self.assertEqual(rotated.status, 200, rotated.json)
                self.assertNotIn("refresh", rotated.json)
                self.assertRefreshCookieIsSafe(rotated)
                self.assertNotEqual(tab.jar.value(REFRESH_COOKIE), first_cookie)
                self.assertNotEqual(tab.access, old_access)
                self.assertIn(CSRF_COOKIE, tab.jar.js_cookies())  # readable by JS, unlike the refresh cookie
                self.assertEqual(tab.profile().status, 200)

                out = tab.logout()
                self.assertEqual(out.status, 200)
                cleared = out.set_cookie(REFRESH_COOKIE)
                self.assertEqual(int(cleared["max-age"]), 0)
                self.assertIsNone(tab.jar.value(REFRESH_COOKIE))  # the browser dropped it
                denied = tab.refresh()
                self.assertEqual((denied.status, denied.code), (401, "token_not_valid"))
                self.assertEqual(tab.profile().status, 401)  # no access token any more

        self.assertEqual(len(seen_cookies), 3)
        self.assertEqual(User.objects.count(), 1)
        self.assertGreaterEqual(BlacklistedToken.objects.count(), 3)

    def test_a_verification_never_signs_the_customer_in(self):
        """Verifying an address must not create a session: a link that logs in whoever opens it
        is login-CSRF (an attacker registers their own address and sends the victim the link)."""
        tab = self.tab()
        tab.register()
        verified = tab.verify(self.link_token("verify"))
        self.assertEqual(verified.status, 200, verified.json)
        self.assertFalse(verified.json["already_verified"])
        self.assertNotIn("access", verified.json)
        self.assertIsNone(verified.set_cookie(REFRESH_COOKIE))
        self.assertIsNone(tab.jar.value(REFRESH_COOKIE))
        self.assertEqual(tab.profile().status, 401)  # still signed out
        self.assertTrue(User.objects.get().is_email_verified)
        self.assertEqual(tab.login().status, 200)  # ... until they sign in themselves
        self.assertEqual(tab.profile().json["user"]["email"], EMAIL)
        self.assertIsNotNone(User.objects.get().last_login)

    def test_a_replaying_a_used_verification_link_does_not_mint_a_session(self):
        """Was a HIGH bug: ``verify_email`` issued access + refresh cookie for *any* token whose
        owner was already verified (used and expired ones too). The link lives in access logs,
        mail archives and browser history, so it was a permanent password-less login."""
        tab = self.tab()
        tab.register()
        token = self.link_token("verify")
        self.assertEqual(tab.verify(token).status, 200)
        tab.logout()
        attacker = self.tab(ip="203.0.113.99")  # different browser, holds only the old link
        replay = attacker.verify(token)
        self.assertEqual(replay.status, 200)
        self.assertNotIn("access", replay.json)
        self.assertIsNone(replay.set_cookie(REFRESH_COOKIE))
        expired = EmailVerificationToken.objects.get(token=token)
        EmailVerificationToken.objects.filter(pk=expired.pk).update(expires_at=timezone.now() - timedelta(days=30))
        stale = attacker.verify(token)
        self.assertEqual(stale.status, 200)
        self.assertNotIn("access", stale.json or {})
        self.assertIsNone(stale.set_cookie(REFRESH_COOKIE))
        self.assertIsNone(attacker.jar.value(REFRESH_COOKIE))

    def test_a_staff_and_inactive_accounts_are_never_signed_in_from_a_link(self):
        for label, extra in (("staff", {"is_staff": True}), ("inactive", {"is_active": False})):
            with self.subTest(label):
                user = make_user(f"{label}@example.com", verified=False, **extra)
                token = EmailVerificationToken.objects.create(user=user)
                reply = self.tab(ip="203.0.113.98").verify(token.token)
                self.assertEqual(reply.status, 200, reply.json)
                self.assertNotIn("access", reply.json)
                self.assertIsNone(reply.set_cookie(REFRESH_COOKIE))

    def test_b_login_right_after_signup_then_resend_link_verify_login(self):
        tab = self.tab()
        self.assertEqual(tab.register().status, 201)
        first_token = self.link_token("verify")

        early = tab.login()
        self.assertEqual(early.status, 200)
        self.assertEqual(early.code, "email_not_verified")
        self.assertTrue(early.json["email_verification_required"])
        self.assertNotIn("access", early.json)
        self.assertIsNone(early.set_cookie(REFRESH_COOKIE))
        self.assertIsNone(tab.jar.value(REFRESH_COOKIE))
        self.assertIsNone(tab.access)
        self.assertEqual(tab.profile().status, 401)
        wrong = tab.login(password="Wrong12345")
        self.assertEqual((wrong.status, wrong.code), (401, "invalid_password"))

        # The first mail was delivered a moment ago: resend honours the cooldown...
        cooling = tab.resend()
        self.assertEqual((cooling.status, cooling.code), (429, "cooldown"))
        self.assertTrue(0 < cooling.json["cooldown_remaining"] <= cooling.json["cooldown_total"])
        self.assertEqual(len(self.mails("verify")), 1)
        # ...without killing the link that is already on its way.
        self.age_verification_mail()
        resent = tab.resend()
        self.assertEqual(resent.status, 200, resent.json)
        self.assertEqual(len(self.mails("verify")), 2)
        self.assertEqual(self.link_token("verify"), first_token)  # reused, not multiplied
        self.assertEqual(EmailVerificationToken.objects.count(), 1)

        self.assertEqual(tab.verify(self.link_token("verify")).status, 200)
        done = tab.login()
        self.assertEqual(done.status, 200)
        self.assertIn("access", done.json)
        self.assertRefreshCookieIsSafe(done)
        self.assertEqual(tab.profile().status, 200)

    def test_b_lost_verification_mail_is_recoverable_via_resend(self):
        """Broker down at sign-up: the customer is told (email_queued false) and Resend works."""
        self.broker_down()
        tab = self.tab()
        registered = tab.register()
        self.assertEqual(registered.status, 201)
        self.assertFalse(registered.json["email_queued"])
        self.assertEqual(mail.outbox, [])
        self.assertEqual(tab.login().code, "email_not_verified")

        self.broker_up()
        resent = tab.resend()  # never sent => no cooldown applies
        self.assertEqual(resent.status, 200, resent.json)
        self.assertEqual(len(self.mails("verify")), 1)
        self.assertEqual(tab.verify(self.link_token("verify")).status, 200)
        self.assertEqual(tab.login().status, 200)

    def test_c_retry_after_a_lost_response_resumes_the_same_account(self):
        tab = self.tab()
        first = tab.register()
        self.assertEqual((first.status, first.json["resumed"]), (201, False))
        retry = tab.register()  # identical request: the browser never saw the 201
        self.assertEqual(retry.status, 201, retry.json)
        self.assertTrue(retry.json["resumed"])
        self.assertTrue(retry.json["email_queued"])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(EmailVerificationToken.objects.count(), 1)
        self.assertLessEqual(len(self.mails("verify")), 2)  # cooldown: 1 in practice
        # A retry with the spelling variants of the same address resumes too.
        for variant in EMAIL_VARIANTS[1:4]:
            self.assertEqual(tab.register(variant).json["resumed"], True, variant)
        self.assertEqual(User.objects.count(), 1)
        self.assertLessEqual(len(self.mails("verify")), 2)

        other = tab.register(password="Different1Pass")
        self.assertEqual((other.status, other.code), (400, "email_exists"))
        self.assertIn("already exists", other.json["error"])
        self.assertTrue(User.objects.get().check_password(PASSWORD))  # nobody took the account over

        self.assertEqual(tab.verify(self.link_token("verify")).status, 200)
        done = tab.register()  # verified now: a real duplicate
        self.assertEqual((done.status, done.code), (400, "email_exists"))
        self.assertEqual(User.objects.count(), 1)

    def test_c_retry_after_broker_outage_delivers_the_mail(self):
        self.broker_down()
        tab = self.tab()
        self.assertFalse(tab.register().json["email_queued"])
        self.broker_up()
        retry = tab.register()
        self.assertEqual((retry.status, retry.json["resumed"], retry.json["email_queued"]), (201, True, True))
        self.assertEqual(len(self.mails("verify")), 1)
        self.assertEqual(User.objects.count(), 1)

    def test_d_partial_signup_failure_leaves_no_account_and_retry_succeeds(self):
        tab = self.tab()
        with patch.object(EmailVerificationToken.objects, "create", side_effect=RuntimeError("token store down")):
            with LogTap() as tap:
                failed = tab.register()
        self.assertEqual((failed.status, failed.code), (500, "server_error"))
        self.assertEqual(failed.json["request_id"], failed.request_id)
        self.assertNotIn("token store down", json.dumps(failed.json))  # no internals to the customer
        self.assertIsNone(failed.set_cookie(REFRESH_COOKIE))
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(EmailVerificationToken.objects.count(), 0)
        self.assertEqual(mail.outbox, [])
        event = events_from(tap.lines, "register")[-1]
        self.assertEqual((event["outcome"], event["status"], event["request_id"]), ("error", 500, failed.request_id))

        retry = tab.register()  # immediately, same details
        self.assertEqual(retry.status, 201, retry.json)
        self.assertFalse(retry.json["resumed"])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(len(self.mails("verify")), 1)
        self.assertEqual(tab.verify(self.link_token("verify")).status, 200)
        self.assertEqual(tab.login().status, 200)


# ----------------------------------------------------------------------------------
# e: one mailbox, many spellings
# ----------------------------------------------------------------------------------


@override_settings(PASSWORD_RESET_COOLDOWN=0)
class EmailCanonicalisationFlowTests(AuthFlowCase):
    def test_e_every_spelling_resolves_to_the_same_single_account(self):
        tab = self.tab()
        self.assertEqual(tab.register(EMAIL_VARIANTS[1]).status, 201)
        self.assertEqual(User.objects.get().email, EMAIL)

        for variant in EMAIL_VARIANTS:  # resend resolves to the account (cooldown proves it)
            with self.subTest(step="resend", variant=variant):
                reply = tab.resend(variant)
                self.assertEqual((reply.status, reply.code), (429, "cooldown"))
        for variant in EMAIL_VARIANTS:  # login before verification: same account, still unverified
            with self.subTest(step="unverified login", variant=variant):
                self.assertEqual(tab.login(variant).code, "email_not_verified")
        for variant in EMAIL_VARIANTS:
            with self.subTest(step="re-register", variant=variant):
                self.assertTrue(tab.register(variant).json["resumed"])
        self.assertEqual((User.objects.count(), EmailVerificationToken.objects.count()), (1, 1))

        self.assertEqual(tab.verify(self.link_token("verify")).status, 200)
        for variant in EMAIL_VARIANTS:
            with self.subTest(step="login", variant=variant):
                login = tab.login(variant)
                self.assertEqual(login.status, 200, login.json)
                self.assertEqual(login.json["user"]["email"], EMAIL)
                self.assertEqual(tab.resend(variant).json, {"message": "Email is already verified", "already_verified": True})

        for variant in EMAIL_VARIANTS:  # password reset by any spelling: one token, one mailbox
            with self.subTest(step="reset request", variant=variant):
                self.assertEqual(tab.reset_request(variant).status, 200)
        self.assertEqual(PasswordResetToken.objects.count(), 1)
        self.assertTrue(all(m.to == [EMAIL] for m in self.mails("reset")))
        self.assertEqual(tab.reset_confirm(self.link_token("reset")).status, 200)
        for variant in EMAIL_VARIANTS:
            with self.subTest(step="login after reset", variant=variant):
                self.assertEqual(tab.login(variant, NEW_PASSWORD).status, 200)
                self.assertEqual(tab.login(variant, PASSWORD).code, "invalid_password")

        # Profile e-mail edits are canonicalised and checked case-insensitively.
        tab.login(EMAIL, NEW_PASSWORD)
        self.assertEqual(tab.update_profile(email=EMAIL_VARIANTS[1]).status, 200)
        moved = tab.update_profile(email="  New.Name@Example.COM\u200b ")
        self.assertEqual(moved.status, 200, moved.json)
        self.assertEqual(User.objects.get().email, "new.name@example.com")
        self.assertEqual(tab.login(EMAIL, NEW_PASSWORD).code, "account_not_found")
        for variant in ("NEW.NAME@example.com", " new.name@example.com\u200b"):
            self.assertEqual(tab.login(variant, NEW_PASSWORD).status, 200)

        other = self.sign_up_and_verify(email="other@example.com")
        self.assertEqual(other.login("other@example.com").status, 200)
        clash = other.update_profile(email=" OTHER2@example.com ")
        self.assertEqual(clash.status, 200)  # not taken by anybody: fine
        taken = other.update_profile(email="NEW.name@Example.com\u200b")
        self.assertEqual((taken.status, taken.code), (400, "email_exists"))

        self.assertEqual(User.objects.count(), 2)
        for user in User.objects.all():
            self.assertEqual(user.email, user.email.strip().lower())


# ----------------------------------------------------------------------------------
# f: the audited dead end
# ----------------------------------------------------------------------------------


class UnverifiedResetFlowTests(AuthFlowCase):
    def test_f_unverified_customer_recovers_through_a_real_reset_mail(self):
        tab = self.tab()
        self.assertEqual(tab.register().status, 201)
        self.assertEqual(tab.login().code, "email_not_verified")  # the dead end...

        self.assertEqual(tab.reset_request().status, 200)
        self.assertEqual(len(self.mails("reset")), 1)  # HEAD never rendered this mail at all
        message = self.mails("reset")[0]
        self.assertEqual(message.to, [EMAIL])
        self.assertIn("Password Reset Request", message.subject)
        token = self.link_token("reset")
        self.assertEqual(PasswordResetToken.objects.get().token, token)
        self.assertEqual(tab.request("GET", RESET_VALIDATE, {"token": token}, bearer=False).status, 200)

        confirmed = tab.reset_confirm(token)
        self.assertEqual(confirmed.status, 200, confirmed.json)
        self.assertTrue(User.objects.get().is_email_verified)
        self.assertEqual(len(mail.outbox), 3)  # verification, reset link, "password changed" notice

        login = tab.login(EMAIL, NEW_PASSWORD)  # ...is gone: access + cookie
        self.assertEqual(login.status, 200, login.json)
        self.assertIn("access", login.json)
        self.assertRefreshCookieIsSafe(login)
        self.assertEqual(tab.profile().status, 200)
        self.assertEqual(tab.login(EMAIL, PASSWORD).code, "invalid_password")
        replay = tab.reset_confirm(token, "AnotherPass77")
        self.assertEqual(replay.status, 400)
        self.assertIn(replay.code, {"token_invalid", "token_expired"})
        self.assertTrue(User.objects.get().check_password(NEW_PASSWORD))

    def test_f_unknown_email_reset_is_indistinguishable_and_sends_nothing(self):
        tab = self.tab()
        self.sign_up_and_verify(tab)
        ok = tab.reset_request(EMAIL)
        unknown = tab.reset_request("nobody@example.com")
        self.assertEqual((ok.status, unknown.status), (200, 200))
        self.assertEqual(ok.json, unknown.json)
        self.assertEqual(len(self.mails("reset")), 1)


# ----------------------------------------------------------------------------------
# g: stale / expired / corrupted sessions
# ----------------------------------------------------------------------------------


class StaleSessionFlowTests(AuthFlowCase):
    def setUp(self):
        super().setUp()
        self.tab_a = self.sign_up_and_verify()
        self.user = User.objects.get()
        self.assertEqual(self.tab_a.login().status, 200)

    def test_g_expired_access_401_then_refresh_restores_the_session(self):
        tab = self.tab_a
        stale = expired_token(self.user)
        denied = tab.profile(bearer=f"Bearer {stale}")
        self.assertEqual((denied.status, denied.code), (401, "token_not_valid"))
        tab.access = stale  # what the SPA holds after a night's sleep
        restored = tab.refresh()
        self.assertEqual(restored.status, 200)
        self.assertEqual(tab.profile().status, 200)
        # A page reload: no in-memory access token, only the HttpOnly cookie survives.
        reloaded = self.tab(jar=tab.jar)
        self.assertEqual(reloaded.profile().status, 401)
        self.assertEqual(reloaded.refresh().status, 200)
        self.assertEqual(reloaded.profile().json["user"]["email"], EMAIL)

    def test_g_garbage_bearer_never_blocks_the_public_auth_endpoints(self):
        for bearer in ("Bearer not.a.jwt", "Bearer " + expired_token(self.user), "Basic Zm9vOmJhcg==", "Bearer"):
            with self.subTest(bearer=bearer[:20]):
                fresh = self.tab(ip="203.0.113.7")
                self.assertEqual(fresh.request("POST", LOGIN, {"email": EMAIL, "password": PASSWORD}, bearer=bearer).status, 200)
                self.assertEqual(fresh.request("POST", REGISTER, {}, bearer=bearer).status, 400)
                self.assertEqual(fresh.request("POST", RESEND, {"email": EMAIL}, bearer=bearer).status, 200)
                self.assertEqual(fresh.request("POST", RESET, {"email": "x@example.com"}, bearer=bearer).status, 200)
                self.assertEqual(fresh.request("POST", VERIFY, {"token": "nope"}, bearer=bearer).status, 400)
                self.assertEqual(fresh.request("POST", LOGOUT, {}, bearer=bearer).status, 200)
                beacon = fresh.request("POST", CLIENT_EVENT, {"op": "refresh", "stage": "network"}, bearer=bearer)
                self.assertEqual(beacon.status, 204)

    def test_g_garbage_bearer_on_an_authenticating_endpoint_is_401(self):
        for bearer in ("Bearer garbage", "Bearer " + expired_token(self.user)):
            for path in (CSRF, PROFILE):
                reply = self.tab_a.request("GET", path, bearer=bearer)
                self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), path)
        no_header = self.tab_a.request("GET", PROFILE, bearer=False)
        self.assertEqual(no_header.status, 401)

    def test_g_access_signed_with_a_different_secret_is_401(self):
        """Production SIGNING_KEY must reject a well-formed JWT signed elsewhere."""
        forged = _access_like_jwt(self.user.pk, secrets.token_urlsafe(32))
        reply = self.tab_a.profile(bearer=f"Bearer {forged}")
        self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), reply.json)

    def test_g_refresh_jwt_as_bearer_access_is_401(self):
        """AUTH_TOKEN_CLASSES is AccessToken only: a refresh JWT must not unlock routes."""
        refresh = str(RefreshToken.for_user(self.user))
        reply = self.tab_a.profile(bearer=f"Bearer {refresh}")
        self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), reply.json)

    def test_g_access_missing_user_id_claim_is_401(self):
        token = AccessToken.for_user(self.user)
        del token["user_id"]
        reply = self.tab_a.profile(bearer=f"Bearer {str(token)}")
        self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), reply.json)

    def test_g_missing_corrupted_and_wrong_type_cookies_are_401_token_not_valid(self):
        good = self.tab_a.jar.value(REFRESH_COOKIE)
        flipped = good[:-4] + ("AAAA" if not good.endswith("AAAA") else "BBBB")
        cases = {
            "missing": None,
            "garbage": "definitely-not-a-jwt",
            "bad signature": flipped,
            "truncated": good[: len(good) // 2],
            "access token as refresh": self.tab_a.access,
            "empty": "",
        }
        for label, value in cases.items():
            with self.subTest(label):
                tab = self.tab(ip="203.0.113.9")
                if value is not None:
                    tab.jar.put(REFRESH_COOKIE, value)
                reply = tab.refresh()
                self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), reply.json)
                self.assertIsNone(reply.set_cookie(REFRESH_COOKIE))
        self.assertEqual(self.tab_a.refresh().status, 200)  # the real cookie is unharmed

    def test_g_expired_refresh_is_401(self):
        tab = self.tab(ip="203.0.113.10")
        tab.jar.put(REFRESH_COOKIE, expired_token(self.user, RefreshToken, hours_ago=24 * 8))
        reply = tab.refresh()
        self.assertEqual((reply.status, reply.code), (401, "token_not_valid"))

    def test_g_csrf_failures_are_403_and_self_heal_like_the_client(self):
        tab = self.tab_a
        naked = tab.request("POST", REFRESH, {}, bearer=False)  # no X-CSRFToken header
        self.assertEqual(naked.status, 403)
        self.assertIn("CSRF", json.dumps(naked.json))
        # csrftoken cookie lost/rotated while the tab still caches the old header value:
        tab.fetch_csrf()
        tab.jar.drop(CSRF_COOKIE)
        healed = tab.refresh()  # 403 -> reset token -> new GET csrf-token -> retry
        self.assertEqual(healed.status, 200)
        self.assertEqual([r.status for r in tab.replies[-4:]], [200, 403, 200, 200])

    def test_g_refresh_for_a_deactivated_user_is_401(self):
        """Was a bug: simplejwt 5.3.1 never looks at the user on refresh, so a deactivated
        customer kept getting 200 + a rotated cookie for up to 7 days."""
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        reply = self.tab_a.refresh()
        self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), reply.json)
        self.assertIsNone(reply.set_cookie(REFRESH_COOKIE))
        # The rejected refresh still spent the token (rotation happens first): a customer
        # who is reactivated later signs in again instead of reviving the old cookie.
        User.objects.filter(pk=self.user.pk).update(is_active=True)
        self.assertEqual(self.tab_a.refresh().status, 401)
        self.assertEqual(self.tab_a.login().status, 200)

    def test_g_refresh_for_a_deleted_user_is_401(self):
        User.objects.filter(pk=self.user.pk).delete()
        reply = self.tab_a.refresh()
        self.assertEqual((reply.status, reply.code), (401, "token_not_valid"), reply.json)

    def test_g_deactivated_or_deleted_user_gets_no_usable_access(self):
        """Whatever refresh answers, the access token it hands out must be worthless."""
        tab = self.tab_a
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(tab.profile().status, 401)
        User.objects.filter(pk=self.user.pk).delete()
        self.assertEqual(tab.profile().status, 401)
        login = self.tab(ip="203.0.113.11").login()
        self.assertEqual((login.status, login.code), (401, "account_not_found"))


# ----------------------------------------------------------------------------------
# h: two tabs / rotation grace
# ----------------------------------------------------------------------------------


class TwoTabRotationTests(AuthFlowCase):
    def setUp(self):
        super().setUp()
        self.jar = CookieJar()
        self.tab_a = self.sign_up_and_verify(self.tab(self.jar))
        self.tab_b = self.tab(self.jar, ip="198.51.100.10")
        self.assertEqual(self.tab_a.login().status, 200)
        self.tab_a.fetch_csrf()  # both tabs have loaded the page: each caches a CSRF token,
        self.tab_b.fetch_csrf()  # the csrftoken cookie (same secret) is shared through the jar
        self.c1 = self.jar.value(REFRESH_COOKIE)

    def test_h_second_tab_with_the_old_cookie_keeps_the_session(self):
        in_flight = self.jar.for_request(REFRESH)  # both tabs' requests carry C1
        first = self.tab_a.refresh(cookies=in_flight)
        self.assertEqual(first.status, 200)
        c2 = self.jar.value(REFRESH_COOKIE)
        self.assertNotEqual(c2, self.c1)

        second = self.tab_b.refresh(cookies=in_flight)  # loser of the race: C1 again
        self.assertEqual(second.status, 200, second.json)
        self.assertIn("access", second.json)
        self.assertIsNone(second.set_cookie(REFRESH_COOKIE), "grace path must not touch the cookie")
        self.assertEqual(self.jar.value(REFRESH_COOKIE), c2)  # winner's cookie survives
        self.assertEqual(self.tab_b.profile().status, 200)
        self.assertEqual(self.tab_a.profile().status, 200)

        third = self.tab_b.refresh()  # B carries on with the jar's cookie
        self.assertEqual(third.status, 200)
        self.assertIsNotNone(third.set_cookie(REFRESH_COOKIE))
        self.assertNotIn(self.jar.value(REFRESH_COOKIE), (self.c1, c2))
        self.assertEqual(self.tab_a.refresh().status, 200)  # and A can too

    def test_h_grace_path_access_token_is_short_lived(self):
        in_flight = self.jar.for_request(REFRESH)
        normal = self.tab_a.refresh(cookies=in_flight)
        graced = self.tab_b.refresh(cookies=in_flight)
        self.assertEqual((normal.status, graced.status), (200, 200))
        now = time.time()
        normal_left = pyjwt.decode(normal.json["access"], options={"verify_signature": False})["exp"] - now
        graced_left = pyjwt.decode(graced.json["access"], options={"verify_signature": False})["exp"] - now
        self.assertGreater(normal_left, 3000)  # ACCESS_TOKEN_LIFETIME is 60 min
        self.assertTrue(0 < graced_left <= 305, graced_left)  # bridges one race only
        self.assertEqual(self.tab_b.profile().status, 200)

    def test_h_after_the_grace_window_the_old_cookie_is_dead(self):
        self.tab_a.refresh()
        newest = self.jar.value(REFRESH_COOKIE)
        cache.delete(f"jwt_rotated:{jti_of(self.c1)}")  # what expiry of the 30 s marker does
        stale = self.tab_b.refresh(cookies={REFRESH_COOKIE: self.c1, CSRF_COOKIE: self.jar.value(CSRF_COOKIE)})
        self.assertEqual((stale.status, stale.code), (401, "token_not_valid"))
        self.assertEqual(self.jar.value(REFRESH_COOKIE), newest)  # a 401 never clobbers the jar
        self.assertEqual(self.tab_a.refresh().status, 200)

    def test_h_grace_marker_really_expires(self):
        in_flight = self.jar.for_request(REFRESH)
        self.tab_a.refresh(cookies=in_flight)
        with patch("django.core.cache.backends.locmem.time.time", return_value=time.time() + 31):
            late = self.tab_b.refresh(cookies=in_flight)
        self.assertEqual((late.status, late.code), (401, "token_not_valid"))

    @override_settings(JWT_REFRESH_ROTATION_GRACE_SECONDS=0)
    def test_h_grace_can_be_switched_off(self):
        in_flight = self.jar.for_request(REFRESH)
        self.tab_a.refresh(cookies=in_flight)
        self.assertEqual(self.tab_b.refresh(cookies=in_flight).status, 401)

    def test_h_logout_kills_the_token_even_inside_the_window(self):
        in_flight = self.jar.for_request(REFRESH)
        self.tab_a.refresh(cookies=in_flight)  # C1 -> C2 (marker for C1)
        c2 = self.jar.value(REFRESH_COOKIE)
        self.assertEqual(self.tab_a.logout().status, 200)  # blacklists C2, ends the window
        self.assertIsNone(self.jar.value(REFRESH_COOKIE))
        late = self.tab_b.refresh(cookies=in_flight)  # tab B still presents C1
        self.assertEqual((late.status, late.code), (401, "token_not_valid"))
        replay_c2 = self.tab_b.refresh(cookies={REFRESH_COOKIE: c2, CSRF_COOKIE: self.jar.value(CSRF_COOKIE)})
        self.assertEqual((replay_c2.status, replay_c2.code), (401, "token_not_valid"))

    def test_h_plain_logout_token_is_never_reusable(self):
        self.tab_a.logout()
        replay = self.tab_b.refresh(cookies={REFRESH_COOKIE: self.c1, CSRF_COOKIE: self.jar.value(CSRF_COOKIE)})
        self.assertEqual((replay.status, replay.code), (401, "token_not_valid"))

    def test_h_logout_with_garbage_authorization_still_clears_the_cookie(self):
        for bearer in ("Bearer garbage", "Bearer " + expired_token(User.objects.get()), "nonsense"):
            with self.subTest(bearer=bearer[:16]):
                self.tab_a.login()
                self.assertIsNotNone(self.jar.value(REFRESH_COOKIE))
                out = self.tab_a.logout(bearer=bearer)
                self.assertEqual(out.status, 200)
                self.assertEqual(int(out.set_cookie(REFRESH_COOKIE)["max-age"]), 0)
                self.assertIsNone(self.jar.value(REFRESH_COOKIE))
                self.assertEqual(self.tab_a.refresh().status, 401)


# ----------------------------------------------------------------------------------
# i: throttling behind the fixed nginx header shape
# ----------------------------------------------------------------------------------


def behind_nginx(client_ip, **extra):
    meta = {"REMOTE_ADDR": NGINX_CONTAINER_IP, "HTTP_X_FORWARDED_FOR": f"{client_ip}, {client_ip}"}
    meta.update(extra)
    return meta


@override_settings(PASSWORD_HASHERS=PROD_LIKE["PASSWORD_HASHERS"])
class ThrottleFlowTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        make_user("known@example.com")
        for name in ("send_verification_email_task", "send_password_reset_email_task"):
            patcher = patch(f"account.views.{name}.delay")
            patcher.start()
            self.addCleanup(patcher.stop)

    def post(self, path, body, ip, **extra):
        return self.client.post(path, body, format="json", **behind_nginx(ip, **extra))

    def wrong_login(self, ip, email="known@example.com"):
        return self.post(LOGIN, {"email": email, "password": "Wrong12345"}, ip)

    @override_settings(**{**NO_THROTTLE, "LOGIN_RATE_LIMIT": "3/minute"})
    def test_i_clients_behind_one_proxy_do_not_share_a_bucket(self):
        with LogTap() as tap:
            for _ in range(3):
                self.assertEqual(self.wrong_login("198.51.100.1").status_code, 401)
            blocked = self.wrong_login("198.51.100.1")
            neighbour = self.wrong_login("198.51.100.2")
            good = self.post(LOGIN, {"email": "known@example.com", "password": PASSWORD}, "198.51.100.3")
        self.assertEqual(blocked.status_code, 429)
        body = blocked.json()
        self.assertEqual(body["code"], "rate_limited")
        self.assertIsInstance(body["retry_after"], int)
        self.assertEqual(body["error"], body["detail"])
        self.assertEqual(body["request_id"], blocked["X-Request-ID"])
        self.assertGreaterEqual(int(blocked["Retry-After"]), 1)
        self.assertIn("no-store", blocked["Cache-Control"])
        self.assertEqual(neighbour.status_code, 401)  # different customer, same nginx
        self.assertEqual(good.status_code, 200)
        throttled = [e for e in events_from(tap.lines) if e["outcome"] == "throttled"]
        self.assertEqual(len(throttled), 1)
        self.assertEqual(throttled[0]["client_ip"], "198.51.100.1")
        self.assertEqual(throttled[0]["throttle_scope"], "login")
        self.assertEqual(throttled[0]["request_id"], blocked["X-Request-ID"])

    @override_settings(**{**NO_THROTTLE, "LOGIN_RATE_LIMIT": "2/minute"})
    def test_i_prepended_forwarded_for_entries_cannot_dodge_the_limit(self):
        for spoof in ("1.1.1.1", "2.2.2.2"):
            self.post(LOGIN, {"email": "x@example.com", "password": "Wrong12345"}, "198.51.100.5",
                      HTTP_X_FORWARDED_FOR=f"{spoof}, 198.51.100.5, 198.51.100.5")
        third = self.post(LOGIN, {"email": "x@example.com", "password": "Wrong12345"}, "198.51.100.5",
                          HTTP_X_FORWARDED_FOR="3.3.3.3, 198.51.100.5, 198.51.100.5")
        self.assertEqual(third.status_code, 429)

    @override_settings(**{**NO_THROTTLE, "LOGIN_RATE_LIMIT": "3/minute"})
    def test_i_ipv6_clients_are_bucketed_per_64(self):
        """One IPv6 subscriber owns a whole /64 and can rotate addresses at will."""
        for ip in ("2001:db8:1:2::1", "2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::ffff"):
            self.assertEqual(self.wrong_login(ip).status_code, 401, ip)
        self.assertEqual(self.wrong_login("2001:db8:1:2::9").status_code, 429)
        self.assertEqual(self.wrong_login("2001:db8:1:3::1").status_code, 401)  # the next /64 is another customer

    @override_settings(**{**NO_THROTTLE, "LOGIN_RATE_LIMIT": "2/minute"})
    def test_i_ipv4_mapped_ipv6_shares_the_ipv4_bucket(self):
        self.assertEqual(self.wrong_login("198.51.100.60").status_code, 401)
        self.assertEqual(self.wrong_login("::ffff:198.51.100.60").status_code, 401)
        self.assertEqual(self.wrong_login("198.51.100.60").status_code, 429)

    @override_settings(**{**NO_THROTTLE, "LOGIN_EMAIL_RATE_LIMIT": "2/minute"})
    def test_i_a_padded_body_cannot_dodge_the_per_account_limit(self):
        """The limiter used to skip bodies over 64 KB: an attacker just padded the request."""
        body = {"email": "known@example.com", "password": "Wrong12345", "pad": "x" * 100_000}
        codes = [self.post(LOGIN, body, "198.51.100.70").status_code for _ in range(3)]
        self.assertEqual(codes, [401, 401, 429])

    @override_settings(**{**NO_THROTTLE, "LOGIN_EMAIL_RATE_LIMIT": "2/minute"})
    def test_i_login_is_limited_per_ip_and_account_not_per_ip_alone(self):
        self.assertEqual(self.wrong_login("198.51.100.9", "Known@Example.com ").status_code, 401)
        self.assertEqual(self.wrong_login("198.51.100.9", "known@example.com\u200b").status_code, 401)
        blocked = self.wrong_login("198.51.100.9")
        self.assertEqual((blocked.status_code, blocked.json()["code"]), (429, "rate_limited"))
        self.assertEqual(self.wrong_login("198.51.100.9", "other@example.com").status_code, 401)
        owner = self.post(LOGIN, {"email": "known@example.com", "password": PASSWORD}, "198.51.100.77")
        self.assertEqual(owner.status_code, 200)  # the real owner, elsewhere, is not locked out

    @override_settings(**{**NO_THROTTLE, "REGISTER_RATE_LIMIT": "2/hour"})
    def test_i_register_is_limited_per_client_and_says_so_friendly(self):
        for n in range(2):
            self.assertEqual(self.post(REGISTER, {"email": f"a{n}@example.com"}, "198.51.100.20").status_code, 400)
        blocked = self.post(REGISTER, {"email": "a3@example.com"}, "198.51.100.20")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["code"], "rate_limited")
        self.assertGreater(int(blocked["Retry-After"]), 60)
        self.assertEqual(self.post(REGISTER, {"email": "a4@example.com"}, "198.51.100.21").status_code, 400)

    @override_settings(**{**NO_THROTTLE, "LOGIN_RATE_LIMIT": "2/minute"})
    def test_i_token_endpoint_shares_the_login_protection(self):
        statuses = [
            self.post(TOKEN, {"email": "known@example.com", "password": "Wrong12345"}, "198.51.100.30").status_code
            for _ in range(3)
        ]
        self.assertEqual(statuses, [401, 401, 429])

    @override_settings(**{**NO_THROTTLE, "PASSWORD_RESET_RATE_LIMIT": "1/hour", "EMAIL_VERIFICATION_RESEND_RATE_LIMIT": "1/hour"})
    def test_i_reset_and_resend_are_throttled_with_the_same_friendly_body(self):
        for path in (RESET, RESEND):
            self.post(path, {"email": "known@example.com"}, "198.51.100.40")
            blocked = self.post(path, {"email": "known@example.com"}, "198.51.100.40")
            self.assertEqual((blocked.status_code, blocked.json()["code"]), (429, "rate_limited"), path)

    @override_settings(**{**NO_THROTTLE, "LOGIN_RATE_LIMIT": "1/minute", "LOGIN_EMAIL_RATE_LIMIT": "1/minute"})
    def test_i_throttles_fail_open_when_the_cache_raises(self):
        class Broken:
            def __getattr__(self, name):
                raise ConnectionError("redis down")

        from rest_framework.throttling import SimpleRateThrottle

        with patch.object(SimpleRateThrottle, "cache", Broken()), self.assertLogs("account.throttles", "WARNING"):
            for _ in range(3):  # would be 429 from the second attempt on
                reply = self.post(LOGIN, {"email": "known@example.com", "password": PASSWORD}, "198.51.100.50")
                self.assertEqual(reply.status_code, 200)

    def test_i_a_dead_cache_never_breaks_any_auth_endpoint(self):
        """Redis down: every step of a customer journey still works (no 5xx anywhere)."""
        def boom(*args, **kwargs):
            raise ConnectionError("redis down")

        cache.clear()
        with self.settings(**NO_THROTTLE, **PROD_LIKE), patch.multiple(
            LocMemCache, get=boom, set=boom, add=boom, delete=boom, incr=boom, has_key=boom, touch=boom
        ), patch("account.views.send_verification_email_task.delay") as delay, patch(
            "account.views.send_verification_confirmation_email_task.delay"
        ), self.assertLogs("account", "WARNING"):
            tab = Tab(self)
            registered = tab.register("dead.cache@example.com")
            self.assertEqual(registered.status, 201, registered.json)
            delay.assert_called()  # guards failed open: the mail is still queued
            token = EmailVerificationToken.objects.get(user__email="dead.cache@example.com").token
            self.assertEqual(tab.verify(token).status, 200)
            self.assertEqual(tab.login("dead.cache@example.com").status, 200)
            self.assertEqual(tab.refresh().status, 200)
            self.assertEqual(tab.profile().status, 200)
            with patch("account.views.send_password_reset_email_task.delay"):
                self.assertEqual(tab.reset_request("dead.cache@example.com").status, 200)
            self.assertEqual(tab.logout().status, 200)
            self.assertEqual(tab.refresh().status, 401)


# ----------------------------------------------------------------------------------
# j: log hygiene
# ----------------------------------------------------------------------------------


@override_settings(PASSWORD_RESET_COOLDOWN=0)
class LogHygieneFlowTests(AuthFlowCase):
    RAW_EMAIL = "  Leaky.Tester+Tag@Example.COM "
    SECRET_PASSWORD = "S3cretPassw0rd!Leak"

    def run_full_journey(self, tap):
        tab = self.tab()
        secrets = {"password": self.SECRET_PASSWORD, "new password": "N3wSecret!Leak99"}
        tab.register(self.RAW_EMAIL, self.SECRET_PASSWORD)
        tab.login(self.RAW_EMAIL, self.SECRET_PASSWORD)  # unverified
        v_token = self.link_token("verify")
        verified = tab.verify(v_token)
        verify_refresh = tab.jar.value(REFRESH_COOKIE) or ""  # verifying issues no session
        tab.login(self.RAW_EMAIL, "Wrong12345")
        tab.login("nobody@example.com", "Wrong12345")
        login = tab.login(self.RAW_EMAIL, self.SECRET_PASSWORD)
        refresh_1 = tab.jar.value(REFRESH_COOKIE)
        tab.refresh()
        tab.request("POST", REFRESH, {}, bearer=False, csrf="nope")  # 403 path
        tab.jar.put(REFRESH_COOKIE, refresh_1)
        tab.refresh()  # grace path
        tab.resend(self.RAW_EMAIL)
        tab.reset_request(self.RAW_EMAIL)
        r_token = self.link_token("reset")
        tab.reset_confirm(r_token, secrets["new password"])
        tab.request("POST", CLIENT_EVENT, {"op": "login", "stage": "network"}, bearer=False)
        secrets.update(
            {
                "verification token": v_token,
                "verify access": verified.json.get("access", ""),
                "verify refresh": verify_refresh or "",
                "reset token": r_token,
                "access": login.json["access"],
                "refresh": refresh_1,
                "current refresh": tab.jar.value(REFRESH_COOKIE) or "",
                "csrf": tab.csrf_token or "",
            }
        )
        tab.logout()
        return tab, {k: v for k, v in secrets.items() if v}

    def test_j_no_credential_or_raw_email_reaches_any_log_and_every_op_is_traced(self):
        with LogTap() as tap:
            tab, secrets = self.run_full_journey(tap)
        haystack = tap.text()
        lowered = haystack.lower()
        for label, secret in secrets.items():
            self.assertNotIn(secret, haystack, f"{label} leaked into the logs")
        for leak in ("leaky.tester", "leaky.tester+tag@example.com", "example.com\u200b"):
            self.assertNotIn(leak, lowered, "raw e-mail leaked into the logs")

        events = events_from(tap.lines)
        ops = {event["op"] for event in events}
        self.assertTrue(
            {"register", "login", "verify_email", "refresh", "logout", "resend_verification",
             "password_reset_request", "password_reset_confirm", "client_event",
             "verification_email"} <= ops,
            ops,
        )
        expected_hash = hash_email(self.RAW_EMAIL)
        self.assertRegex(expected_hash, r"^[0-9a-f]{16}$")
        for event in events:
            for field in ("event", "ts", "op", "outcome", "request_id"):
                self.assertIn(field, event, event)
            self.assertNotIn("email", event)
        hashed = [e for e in events if e.get("email_hash")]
        self.assertTrue(hashed)
        self.assertIn(expected_hash, {e["email_hash"] for e in hashed})

        # Every HTTP call that changes/reads auth state is traceable by its X-Request-ID.
        traced_ops = {"register", "login", "logout", "token/refresh", "verify-email", "resend-verification",
                      "password-reset", "client-event"}
        logged_ids = {e["request_id"] for e in events}
        for reply in tab.replies:
            if any(f"/{name}/" in reply.path for name in traced_ops):
                self.assertIn(reply.request_id, logged_ids, f"{reply.path} left no trace")

    def test_j_server_error_traceback_does_not_leak_the_email(self):
        """Was a bug (fixed): a driver error embeds the row values
        (``Key (email)=(...)``). ``AuthEventFormatter`` scrubs that for ``account.auth``, but
        ``views._server_error`` also calls ``logger.exception`` on the ``account`` logger,
        whose ``simple`` console formatter prints the raw traceback -> the customer's
        address reaches the plain-text log."""
        leaky = IntegrityError(
            'duplicate key value violates unique constraint "account_customuser_email_key"\n'
            "DETAIL:  Key (email)=(leaky.tester+tag@example.com) already exists."
        )
        tab = self.tab()
        with patch.object(EmailVerificationToken.objects, "create", side_effect=leaky), LogTap() as tap:
            failed = tab.register(self.RAW_EMAIL, self.SECRET_PASSWORD)
        self.assertEqual((failed.status, failed.code), (500, "server_error"))
        self.assertNotIn("leaky.tester", tap.text().lower())


# ----------------------------------------------------------------------------------
# k: legacy data
# ----------------------------------------------------------------------------------


@override_settings(PASSWORD_RESET_COOLDOWN=0)
class LegacyDataFlowTests(AuthFlowCase):
    def test_k_case_duplicate_rows_still_log_in_verify_and_reset(self):
        lower, mixed = make_legacy_duplicates()
        User.objects.filter(pk=mixed.pk).update(is_email_verified=False)  # the mixed row never verified
        tab = self.tab()

        with self.assertLogs("account.auth", "WARNING") as logs:
            low = tab.login("DUP@example.com ", "LowerPass1")
        self.assertEqual(low.status, 200)
        self.assertEqual(low.json["user"]["id"], lower.pk)
        self.assertTrue(any(e["stage"] == "duplicate_email_rows" for e in events_from([("account.auth", l.split(":", 2)[2]) for l in logs.output])))
        # the mixed-case row's owner: right password, own row, still unverified
        mixed_login = self.tab(ip="203.0.113.21").login("dup@example.com", "MixedPass1")
        self.assertEqual(mixed_login.code, "email_not_verified")
        self.assertEqual(mixed_login.json["user"]["id"], mixed.pk)

        token = EmailVerificationToken.objects.create(user=User.objects.get(pk=mixed.pk))
        verified = tab.verify(token.token)  # fails full_clean() (its twin exists) but must verify
        self.assertEqual(verified.status, 200, verified.json)
        self.assertEqual(self.tab(ip="203.0.113.22").login("dup@example.com", "MixedPass1").status, 200)

        self.assertEqual(tab.reset_request("Dup@Example.com").status, 200)  # 200, not 500
        self.assertEqual(tab.reset_confirm(self.link_token("reset"), NEW_PASSWORD).status, 200)
        self.assertEqual(self.tab(ip="203.0.113.23").login("dup@example.com", NEW_PASSWORD).status, 200)
        self.assertEqual(User.objects.count(), 2)  # nothing merged or created behind our back

    def test_k_a_row_that_fails_full_clean_can_log_in_verify_and_change_password(self):
        bad = User.objects.bulk_create([
            User(email="legacy user@example.com", password=make_password(PASSWORD),
                 first_name="Leg", surname="Acy", is_email_verified=False)
        ])[0]
        with self.assertRaises(Exception):
            bad.full_clean()
        tab = self.tab()
        self.assertEqual(tab.login("legacy user@example.com").code, "email_not_verified")
        row = EmailVerificationToken.objects.create(user=bad)
        self.assertEqual(tab.verify(row.token).status, 200)
        login = tab.login("legacy user@example.com")
        self.assertEqual(login.status, 200, login.json)
        changed = tab.request(
            "POST", API + "change-password/",
            {"old_password": PASSWORD, "new_password": NEW_PASSWORD},
        )
        self.assertLess(changed.status, 500, changed.json)

    def test_k_audit_reports_the_bad_rows_and_repair_dry_run_changes_nothing(self):
        make_legacy_duplicates()
        User.objects.bulk_create([
            User(email="Padded@Example.com ", password=make_password(PASSWORD), first_name="P", surname="D"),
            User(email="legacy user@example.com", password=make_password(PASSWORD), first_name="L", surname="U"),
        ])

        out = StringIO()
        call_command("check_auth_data", "--json", stdout=out)
        report = json.loads(out.getvalue())
        checks = report["checks"]
        self.assertFalse(report["summary"]["ok"])
        self.assertEqual(checks["duplicate_emails"]["count"], 1)
        self.assertGreaterEqual(checks["non_canonical_emails"]["count"], 2)
        self.assertGreaterEqual(checks["invalid_email_format"]["count"], 1)
        self.assertGreaterEqual(checks["full_clean_failures"]["count"], 1)
        self.assertNotIn("@example.com", out.getvalue())  # ids only, never addresses

        def snapshot():
            return (
                list(User.objects.order_by("pk").values()),
                EmailVerificationToken.objects.count(),
                PasswordResetToken.objects.count(),
            )

        before = snapshot()
        for args in (
            ("--normalize-emails",),
            ("--issue-tokens",),
            ("--resend-verification",),
            ("--normalize-emails", "--issue-tokens", "--resend-verification"),
        ):
            call_command("repair_auth_data", *args, stdout=StringIO())  # no --apply: dry-run
        self.assertEqual(snapshot(), before)
        self.assertEqual(mail.outbox, [])  # a dry run mails nobody
        after = StringIO()
        call_command("check_auth_data", "--json", stdout=after)
        self.assertEqual(json.loads(after.getvalue())["checks"]["duplicate_emails"]["count"], 1)


# ----------------------------------------------------------------------------------
# l: password recovery ends sessions (F-sec follow-ups)
# ----------------------------------------------------------------------------------

CHANGE_PASSWORD = API + "change-password/"
CHECK_VERIFICATION = API + "check-verification/"


def live_refresh_tokens(user):
    return OutstandingToken.objects.filter(
        user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True
    )


class SessionRevocationFlowTests(AuthFlowCase):
    def setUp(self):
        super().setUp()
        self.laptop = self.sign_up_and_verify()
        self.laptop.logout()  # verifying signed the browser in; start from a clean slate
        self.phone = self.tab(ip="203.0.113.50")
        self.laptop.login()
        self.phone.login()
        self.login_cookie = self.laptop.jar.value(REFRESH_COOKIE)  # L1 (about to be rotated)
        self.laptop.fetch_csrf()
        self.assertEqual(self.laptop.refresh().status, 200)  # L1 -> R1 (marker for L1)
        self.assertEqual(self.phone.refresh().status, 200)
        self.user = User.objects.get()

    def test_l_rotated_refresh_tokens_are_tracked_as_the_live_sessions(self):
        # Two browsers: exactly their two *rotated* cookies are live, the login ones are spent.
        self.assertEqual(live_refresh_tokens(self.user).count(), 2)
        self.assertFalse(live_refresh_tokens(self.user).filter(jti=jti_of(self.login_cookie)).exists())
        self.laptop.refresh()
        self.assertEqual(live_refresh_tokens(self.user).count(), 2)  # rotation replaces, never accumulates

    def test_l_password_reset_ends_every_session_including_the_grace_window(self):
        self.laptop.reset_request()
        confirmed = self.laptop.reset_confirm(self.link_token("reset"))
        self.assertEqual(confirmed.status, 200, confirmed.json)
        self.assertEqual(live_refresh_tokens(self.user).count(), 0)

        for name, tab in (("laptop", self.laptop), ("phone", self.phone)):
            with self.subTest(name):
                reply = tab.refresh()
                self.assertEqual((reply.status, reply.code), (401, "token_not_valid"))
        # L1 was rotated moments ago (grace marker alive) - recovery must still kill it.
        csrf = self.laptop.jar.value(CSRF_COOKIE)
        replay = self.laptop.refresh(cookies={REFRESH_COOKIE: self.login_cookie, CSRF_COOKIE: csrf})
        self.assertEqual((replay.status, replay.code), (401, "token_not_valid"))

        fresh = self.tab(ip="203.0.113.51")
        self.assertEqual(fresh.login(EMAIL, PASSWORD).code, "invalid_password")
        self.assertEqual(fresh.login(EMAIL, NEW_PASSWORD).status, 200)
        self.assertEqual(fresh.refresh().status, 200)  # the new session is a normal one
        self.assertEqual(fresh.profile().status, 200)
        self.assertEqual(live_refresh_tokens(self.user).count(), 1)

    def test_l_change_password_ends_the_other_sessions_and_spares_this_one(self):
        changed = self.laptop.request("POST", CHANGE_PASSWORD, {"old_password": PASSWORD, "new_password": NEW_PASSWORD})
        self.assertEqual(changed.status, 200, changed.json)
        self.assertEqual(live_refresh_tokens(self.user).count(), 1)
        phone = self.phone.refresh()
        self.assertEqual((phone.status, phone.code), (401, "token_not_valid"))
        self.assertEqual(self.laptop.refresh().status, 200)  # the browser that changed it stays signed in
        self.assertEqual(self.laptop.profile().status, 200)
        self.assertEqual(self.tab(ip="203.0.113.52").login(EMAIL, NEW_PASSWORD).status, 200)

    def test_l_wrong_current_password_revokes_nothing(self):
        bad = self.laptop.request("POST", CHANGE_PASSWORD, {"old_password": "Wrong12345", "new_password": NEW_PASSWORD})
        self.assertEqual(bad.status, 400)
        self.assertEqual(live_refresh_tokens(self.user).count(), 2)
        self.assertEqual(self.phone.refresh().status, 200)


class PublicLookupFlowTests(AuthFlowCase):
    def test_l_status_lookups_ignore_a_stale_bearer(self):
        tab = self.tab()
        tab.register()
        vtoken = self.link_token("verify")
        tab.reset_request()
        rtoken = self.link_token("reset")
        for bearer in ("Bearer garbage", "Bearer " + expired_token(User.objects.get())):
            with self.subTest(bearer=bearer[:14]):
                status = tab.request("GET", CHECK_VERIFICATION, {"token": vtoken}, bearer=bearer)
                self.assertEqual((status.status, status.json["valid"], status.json["is_verified"]), (200, True, False))
                valid = tab.request("GET", RESET_VALIDATE, {"token": rtoken}, bearer=bearer)
                self.assertEqual(valid.status, 200, valid.json)

    @override_settings(EMAIL_VERIFICATION_RATE_LIMIT="3/hour")
    def test_l_status_lookups_share_the_verification_throttle(self):
        tab = self.tab()
        tab.register()
        vtoken = self.link_token("verify")
        statuses = [
            tab.request("GET", CHECK_VERIFICATION, {"token": vtoken}, bearer=False).status,
            tab.request("GET", RESET_VALIDATE, {"token": "guess-1"}, bearer=False).status,
            tab.request("GET", CHECK_VERIFICATION, {"token": "guess-2"}, bearer=False).status,
        ]
        self.assertEqual(statuses, [200, 400, 400])
        for path in (CHECK_VERIFICATION, RESET_VALIDATE):
            blocked = tab.request("GET", path, {"token": "guess-3"}, bearer=False)
            self.assertEqual((blocked.status, blocked.code), (429, "rate_limited"), path)
            self.assertGreaterEqual(int(blocked["Retry-After"]), 1)
        self.assertEqual(tab.verify(vtoken).status, 429)  # same scope: token guessing is capped in total


# ----------------------------------------------------------------------------------
# m: hostile input
# ----------------------------------------------------------------------------------


class HostileInputFlowTests(AuthFlowCase):
    NUL = chr(0)

    def test_m_nul_characters_never_produce_a_500_or_reach_the_database(self):
        nul = self.NUL
        tab = self.tab()
        self.assertEqual(tab.register("nul" + nul + "@example.com").status, 400)
        self.assertEqual(User.objects.count(), 0)
        registered = tab.register("nul@example.com", "Secure" + nul + "Pass1", "Ada" + nul, "Love" + nul + "lace")
        self.assertEqual(registered.status, 201, registered.json)
        user = User.objects.get()
        self.assertEqual((user.first_name, user.surname), ("Ada", "Lovelace"))
        self.assertNotIn(nul, user.email + user.password)
        for reply in (
            tab.login("nul" + nul + "@example.com", PASSWORD),
            tab.resend("nul" + nul + "@example.com"),
            tab.reset_request("nul" + nul + "@example.com"),
            tab.reset_request("nul@example.com" + nul),
            tab.verify("tok" + nul + "en"),
            tab.reset_confirm("tok" + nul + "en"),
            tab.request("GET", RESET_VALIDATE, {"token": "a" + nul + "b"}, bearer=False),
            tab.request("GET", CHECK_VERIFICATION, {"token": "a" + nul + "b"}, bearer=False),
            tab.request("POST", CLIENT_EVENT, {"op": "login", "stage": "network", "error": "x" + nul}, bearer=False),
        ):
            self.assertLess(reply.status, 500, (reply.path, reply.json))
        self.assertEqual(User.objects.count(), 1)

    def test_m_hostile_names_cannot_smuggle_links_or_headers_into_the_greeting(self):
        tab = self.tab()
        registered = tab.register(
            first="Hi", surname="visit http://evil.example/pay now\r\nBcc: evil@example.org"
        )
        self.assertEqual(registered.status, 201, registered.json)
        tab.verify(self.link_token("verify"))
        tab.reset_request()
        self.assertGreaterEqual(len(mail.outbox), 3)
        for message in mail.outbox:
            html = "".join(body for body, mime in message.alternatives if mime == "text/html")
            for text in (message.body, html, message.subject):
                self.assertNotIn("evil", text)
            self.assertEqual((message.bcc, message.cc), ([], []))
            self.assertIn("Hi", message.body)
