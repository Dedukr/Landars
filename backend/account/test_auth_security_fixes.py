"""Regression tests for the security-review findings on the auth change set.

* password reset / change must end live sessions (SimpleJWT 5.3 does not track rotated
  refresh tokens as outstanding, so this needs the tracking added in ``views.py``)
* refresh must refuse deactivated users; the grace access token is short-lived
* logout blacklist failures are visible; public token-check GETs ignore stale bearers
* throttles: IPv6 /64 bucketing, no body-size bypass of the per-email limiter
* NUL characters never reach PostgreSQL (500); hostile names never reach email greetings
"""

from __future__ import annotations

import time
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from account.email_utils import safe_greeting_name, send_email_verification_email
from account.jwt_cookies import refresh_cookie_name
from account.models import CustomUser, EmailVerificationToken, PasswordResetToken

PASSWORD = "SecurePass123!"


@override_settings(
    JWT_REFRESH_COOKIE_SECURE=False,
    JWT_REFRESH_COOKIE_SAMESITE="Lax",
    JWT_REFRESH_ROTATION_GRACE_SECONDS=30,
    LOGIN_RATE_LIMIT="1000/minute",
    LOGIN_EMAIL_RATE_LIMIT="1000/minute",
    PASSWORD_RESET_RATE_LIMIT="1000/hour",
)
class SessionRevocationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.cookie = refresh_cookie_name()
        self.user = CustomUser.objects.create_user(
            email="revoke@example.com",
            password=PASSWORD,
            first_name="Rev",
            surname="Oke",
            is_email_verified=True,
        )

    def login(self):
        """One 'device': returns (access, refresh cookie value)."""
        response = APIClient().post(
            reverse("login"),
            {"email": "revoke@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["access"], response.cookies[self.cookie].value

    def refresh(self, cookie):
        self.client.cookies[self.cookie] = cookie
        csrf = self.client.get(reverse("csrf_token")).data["csrfToken"]
        return self.client.post(
            reverse("token_refresh"), {}, format="json", HTTP_X_CSRFTOKEN=csrf
        )

    def reset_password(self, new_password="BrandNew456!"):
        token = PasswordResetToken.objects.create(user=self.user)
        return APIClient().post(
            reverse("confirm_password_reset"),
            {"token": token.token, "new_password": new_password},
            format="json",
        )

    # -- rotated tokens are tracked ---------------------------------------------
    def test_rotated_refresh_token_is_recorded_as_outstanding_for_the_user(self):
        _access, first = self.login()
        response = self.refresh(first)
        self.assertEqual(response.status_code, 200)
        second = response.cookies[self.cookie].value
        jti = RefreshToken(second)["jti"]
        row = OutstandingToken.objects.get(jti=jti)
        self.assertEqual(row.user_id, self.user.pk)  # SimpleJWT alone would not create it

    # -- password reset ends sessions --------------------------------------------
    def test_password_reset_revokes_the_live_session_and_the_grace_window(self):
        _access, first = self.login()
        second = self.refresh(first).cookies[self.cookie].value  # live session
        self.assertEqual(self.reset_password().status_code, 200)

        self.assertEqual(self.refresh(second).status_code, 401)  # live token revoked
        # the just-rotated old token must not be revivable through the grace window
        self.assertEqual(self.refresh(first).status_code, 401)

        # and the customer can sign in with the new password
        again = APIClient().post(
            reverse("login"),
            {"email": "revoke@example.com", "password": "BrandNew456!"},
            format="json",
        )
        self.assertEqual(again.status_code, 200)

    def test_password_reset_revokes_every_device_not_just_one(self):
        cookies = [self.login()[1] for _ in range(3)]
        self.assertEqual(self.reset_password().status_code, 200)
        for cookie in cookies:
            self.assertEqual(self.refresh(cookie).status_code, 401)
        self.assertEqual(
            BlacklistedToken.objects.filter(token__user=self.user).count(), 3
        )

    # -- password change keeps this session, ends the others ------------------------
    def test_password_change_ends_other_sessions_but_keeps_the_current_one(self):
        access_a, cookie_a = self.login()  # the device changing the password
        _access_b, cookie_b = self.login()  # another device / an attacker
        client = APIClient()
        client.cookies[self.cookie] = cookie_a
        response = client.post(
            reverse("change_password"),
            {"old_password": PASSWORD, "new_password": "BrandNew456!"},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access_a}",
        )
        self.assertEqual(response.status_code, 200, response.data)

        self.assertEqual(self.refresh(cookie_b).status_code, 401)
        self.assertEqual(self.refresh(cookie_a).status_code, 200)

    # -- refresh refuses deactivated users --------------------------------------------
    def test_refresh_is_refused_for_a_deactivated_user(self):
        _access, cookie = self.login()
        CustomUser.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.refresh(cookie).status_code, 401)

    # -- grace access tokens are short-lived --------------------------------------------
    def test_grace_access_token_lives_at_most_five_minutes(self):
        _access, first = self.login()
        self.assertEqual(self.refresh(first).status_code, 200)  # winner rotates
        graced = self.refresh(first)  # loser of the race, inside the window
        self.assertEqual(graced.status_code, 200)
        self.assertNotIn(self.cookie, graced.cookies)  # access only, cookie untouched
        payload = AccessToken(graced.data["access"]).payload
        # (``iat`` is copied from the refresh token, so measure from "now", not from iat)
        remaining = payload["exp"] - time.time()
        self.assertGreater(remaining, 0)
        self.assertLessEqual(remaining, 300)

    # -- logout failures are not silent ----------------------------------------------------
    def test_logout_blacklist_failure_is_logged_as_a_warning(self):
        _access, cookie = self.login()
        client = APIClient()
        client.cookies[self.cookie] = cookie
        with patch.object(RefreshToken, "blacklist", side_effect=RuntimeError("db down")):
            with self.assertLogs("account.auth", level="WARNING") as captured:
                response = client.post(reverse("logout"), {}, format="json")
        self.assertEqual(response.status_code, 200)  # the cookie is still cleared
        self.assertTrue(any("blacklist_failed" in line for line in captured.output))

    def test_logout_of_an_already_invalid_token_is_not_a_warning(self):
        client = APIClient()
        client.cookies[self.cookie] = "not-a-jwt"
        with self.assertNoLogs("account.auth", level="WARNING"):
            response = client.post(reverse("logout"), {}, format="json")
        self.assertEqual(response.status_code, 200)


@override_settings(EMAIL_VERIFICATION_RATE_LIMIT="60/hour")
class PublicTokenChecksTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_stale_bearer_header_does_not_break_the_token_checks(self):
        for name in ("check_verification_status", "validate_password_reset_token"):
            response = APIClient().get(
                reverse(name), {"token": "nope"}, HTTP_AUTHORIZATION="Bearer stale.jwt.value"
            )
            # 400 = the view ran and rejected the token (401 = JWT auth ran first)
            self.assertEqual(response.status_code, 400, name)

    @override_settings(EMAIL_VERIFICATION_RATE_LIMIT="2/hour")
    def test_token_checks_are_throttled(self):
        for name in ("check_verification_status", "validate_password_reset_token"):
            cache.clear()
            codes = [
                APIClient()
                .get(
                    reverse(name),
                    {"token": "nope"},
                    HTTP_X_FORWARDED_FOR="203.0.113.5, 203.0.113.5",
                )
                .status_code
                for _ in range(3)
            ]
            self.assertEqual(codes, [400, 400, 429], name)


@override_settings(
    LOGIN_RATE_LIMIT="3/minute",
    LOGIN_EMAIL_RATE_LIMIT="1000/minute",
)
class ThrottleBucketTests(TestCase):
    def setUp(self):
        cache.clear()

    def attempt(self, ip, email="ghost@example.com", extra=None):
        body = {"email": email, "password": "x", **(extra or {})}
        return APIClient().post(
            reverse("login"),
            body,
            format="json",
            REMOTE_ADDR="172.18.0.5",  # the nginx container, as gunicorn sees it
            HTTP_X_FORWARDED_FOR=f"{ip}, {ip}",  # nginx-fixed shape: real client last
        )

    def test_addresses_inside_one_ipv6_64_share_a_bucket(self):
        codes = [self.attempt(f"2001:db8:1:2::{i:x}").status_code for i in range(1, 6)]
        self.assertEqual(codes, [401, 401, 401, 429, 429])
        # a different /64 is a different customer
        self.assertEqual(self.attempt("2001:db8:1:3::1").status_code, 401)

    def test_ipv4_mapped_ipv6_uses_the_ipv4_bucket(self):
        for _ in range(3):
            self.assertEqual(self.attempt("::ffff:203.0.113.9").status_code, 401)
        self.assertEqual(self.attempt("203.0.113.9").status_code, 429)

    @override_settings(LOGIN_RATE_LIMIT="1000/minute", LOGIN_EMAIL_RATE_LIMIT="2/minute")
    def test_oversized_body_does_not_switch_the_per_email_limiter_off(self):
        padding = {"padding": "a" * 70_000}  # > the 64 KB shortcut that used to skip it
        codes = [
            self.attempt("203.0.113.7", "victim@example.com", padding).status_code
            for _ in range(3)
        ]
        self.assertEqual(codes, [401, 401, 429])


@override_settings(
    LOGIN_RATE_LIMIT="1000/minute",
    LOGIN_EMAIL_RATE_LIMIT="1000/minute",
    REGISTER_RATE_LIMIT="1000/hour",
)
class NulByteTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_nul_in_login_email_is_a_400_not_a_database_error(self):
        response = APIClient().post(
            reverse("login"),
            {"email": "a\x00b@example.com", "password": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("account.views.send_verification_email_task.delay")
    def test_nul_in_names_is_dropped_on_register(self, _delay):
        response = APIClient().post(
            reverse("register"),
            {
                "email": "nul@example.com",
                "password": PASSWORD,
                "first_name": "Ann\x00",
                "surname": "Lee",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(CustomUser.objects.get(email="nul@example.com").first_name, "Ann")

    def test_nul_in_register_email_is_a_400(self):
        response = APIClient().post(
            reverse("register"),
            {
                "email": "a\x00@example.com",
                "password": PASSWORD,
                "first_name": "Ann",
                "surname": "Lee",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="noreply@example.com",
)
class GreetingNameTests(TestCase):
    def test_keeps_real_names(self):
        for name in ("Ana", "Ana María", "Jean-Luc O'Brien", "José", "St. John"):
            self.assertEqual(safe_greeting_name(name), name)

    def test_drops_links_sentences_and_non_strings(self):
        hostile = "URGENT: your account is locked, visit https://evil.example/login now -"
        self.assertEqual(safe_greeting_name(hostile), "there")
        self.assertEqual(safe_greeting_name("Mary http://x.io"), "Mary")
        self.assertEqual(safe_greeting_name("Bob <b>click</b>"), "Bob")
        self.assertEqual(safe_greeting_name("a@b.c"), "there")
        for value in ("", "   ", None, 123, ["x"], "x" * 80):
            self.assertEqual(safe_greeting_name(value), "there")

    def test_keeps_at_most_three_words(self):
        self.assertEqual(safe_greeting_name("A B C D E"), "A B C")

    def test_verification_email_never_repeats_attacker_text(self):
        sent = send_email_verification_email(
            to_email="victim@example.com",
            user_name="Verify now at https://evil.example/login",
            verification_url="https://shop.example/verify-email?token=abc123",
        )
        self.assertTrue(sent)
        body = mail.outbox[0].body + "".join(a[0] for a in mail.outbox[0].alternatives)
        self.assertNotIn("evil.example", body)
        self.assertIn("abc123", body)  # the real link is still there


@override_settings(JWT_REFRESH_COOKIE_SECURE=False, EMAIL_VERIFICATION_RATE_LIMIT="1000/hour")
class VerifyEmailNeverSignsInTests(TestCase):
    """Verifying an address must not create a session.

    A link that signs in whoever opens it is login-CSRF (an attacker registers their own
    address and mails the victim the link: the victim's browser lands in the attacker's
    account), and every old link sitting in an inbox would become a login credential.
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.cookie = refresh_cookie_name()

    def unverified(self, email="fresh@example.com", **extra):
        user = CustomUser.objects.create_user(
            email=email,
            password=PASSWORD,
            first_name="Fre",
            surname="Sh",
            is_email_verified=False,
            **extra,
        )
        return user, EmailVerificationToken.objects.create(user=user)

    def verify(self, token):
        return self.client.post(
            reverse("verify_email"), {"token": token.token}, format="json"
        )

    def assertNoSession(self, response):
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertNotIn(self.cookie, response.cookies)

    def test_first_use_verifies_but_does_not_sign_in(self):
        user, token = self.unverified()
        response = self.verify(token)
        self.assertNoSession(response)
        self.assertFalse(response.data["already_verified"])
        user.refresh_from_db()
        self.assertTrue(user.is_email_verified)
        self.assertIsNone(user.last_login)

    def test_replaying_the_same_link_never_signs_in(self):
        _user, token = self.unverified()
        self.verify(token)
        for _ in range(2):
            replay = self.verify(token)
            self.assertNoSession(replay)
            self.assertTrue(replay.data["already_verified"])

    def test_an_old_link_of_an_already_verified_customer_is_not_a_login(self):
        user, token = self.unverified()
        CustomUser.objects.filter(pk=user.pk).update(is_email_verified=True)  # verified elsewhere
        response = self.verify(token)
        self.assertNoSession(response)
        self.assertTrue(response.data["already_verified"])

    def test_staff_and_inactive_accounts_are_never_signed_in_from_a_link(self):
        for label, extra in (("staff", {"is_staff": True}), ("inactive", {"is_active": False})):
            with self.subTest(label):
                user, token = self.unverified(f"{label}@example.com", **extra)
                self.assertNoSession(self.verify(token))
                user.refresh_from_db()
                self.assertTrue(user.is_email_verified)


class TracebackScrubbingTests(TestCase):
    """Driver errors quote the offending value; text logs must not print a customer's address."""

    def format_exception_record(self, formatter):
        import logging
        import sys

        from django.db import IntegrityError

        try:
            raise IntegrityError(
                'duplicate key value violates unique constraint "account_customuser_email_key"\n'
                "DETAIL:  Key (email)=(victim.person@example.com) already exists."
            )
        except IntegrityError:
            record = logging.LogRecord(
                "account", logging.ERROR, __file__, 1, "Unexpected error in register", (), sys.exc_info()
            )
        record.request_id = "rid-1"
        return formatter.format(record)

    def test_scrubbing_formatter_masks_the_email_in_tracebacks(self):
        from account.observability import ScrubbingFormatter

        text = self.format_exception_record(ScrubbingFormatter("{message}", style="{"))
        self.assertIn("IntegrityError", text)  # the traceback is still useful
        self.assertNotIn("victim.person", text)
        self.assertIn("<email>", text)

    def test_the_configured_text_formatter_is_the_scrubbing_one(self):
        import logging.config
        from copy import deepcopy

        from django.conf import settings

        config = deepcopy(settings.LOGGING)
        config["disable_existing_loggers"] = False
        self.assertEqual(
            config["formatters"]["simple"]["()"], "account.observability.ScrubbingFormatter"
        )
        # the dictConfig really builds it (no bad kwargs) and it scrubs
        logging.config.dictConfig(config)
        root_handler = logging.getLogger().handlers[0]
        text = self.format_exception_record(root_handler.formatter)
        self.assertNotIn("victim.person", text)
