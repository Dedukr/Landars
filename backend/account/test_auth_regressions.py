"""Regression tests for the customer-authentication reliability fixes (F3, F4, F5).

Every test here fails on the behaviour that was live before the fix (see the test
docstrings). Session/refresh/logout fixes (F6) live in
``test_auth_regressions_sessions.py``.

Register/resend/reset use ``TransactionTestCase`` because their Celery publish runs in
``transaction.on_commit`` (a plain ``TestCase`` never commits, so it would not run).
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest.mock import patch

from celery.exceptions import Retry
from django.contrib.auth.hashers import make_password
from django.core import mail
from django.core.cache import cache
from django.db import DatabaseError, IntegrityError
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from account import tasks as account_tasks
from account.models import CustomUser, EmailVerificationToken, PasswordResetToken

User = CustomUser

REGISTER = "/api/auth/register/"
LOGIN = "/api/auth/login/"
RESEND = "/api/auth/resend-verification/"
VERIFY = "/api/auth/verify-email/"
RESET = "/api/auth/password-reset/"
RESET_CONFIRM = "/api/auth/password-reset/confirm/"

# Rate limits are not what these tests are about; the throttle tests set their own.
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
)
PASSWORD = "SecurePass1"


def reg_payload(**overrides):
    payload = {
        "email": "new@example.com",
        "password": PASSWORD,
        "first_name": "New",
        "surname": "User",
    }
    payload.update(overrides)
    return payload


def make_user(email="user@example.com", *, verified=True, password=PASSWORD, **extra):
    return User.objects.create_user(
        email=email,
        password=password,
        first_name="Test",
        surname="User",
        is_email_verified=verified,
        **extra,
    )


def make_legacy_duplicates(*, lower_password="LowerPass1", mixed_password="MixedPass1"):
    """Two case-variant rows, as found in old databases (bypasses save()/clean())."""
    lower, mixed = User.objects.bulk_create(
        [
            User(
                email="dup@example.com",
                password=make_password(lower_password),
                first_name="Low",
                surname="Er",
                is_email_verified=True,
            ),
            User(
                email="Dup@Example.com",
                password=make_password(mixed_password),
                first_name="Mix",
                surname="Ed",
                is_email_verified=True,
            ),
        ]
    )
    return lower, mixed


def auth_events(cm):
    """Parsed JSON events captured from ``assertLogs('account.auth')``."""
    events = []
    for line in cm.output:
        body = line.split(":", 2)[2].split("\n", 1)[0]  # error events append a traceback
        try:
            events.append(json.loads(body))
        except ValueError:
            continue
    return events


def fullwidth(text):
    return "".join(
        chr(ord(c) + 0xFEE0) if 0x21 <= ord(c) <= 0x7E else c for c in text
    )


@override_settings(**NO_THROTTLE)
class RegisterRegressionTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    # -- F3a: partial account ----------------------------------------------------

    def test_token_insert_failure_leaves_no_user_and_retry_succeeds(self):
        """Old: create_user autocommitted, the token insert failed -> 500 AND a user
        row stayed, so the retry said "already exists" for an unusable account."""
        for exc in (DatabaseError("boom"), IntegrityError("boom"), RuntimeError("boom")):
            with self.subTest(exc=type(exc).__name__):
                with patch.object(
                    EmailVerificationToken.objects, "create", side_effect=exc
                ), self.assertLogs("account", level="ERROR"):
                    response = self.client.post(REGISTER, reg_payload(), format="json")
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.data["code"], "server_error")
                self.assertTrue(response.data["request_id"])
                self.assertEqual(User.objects.filter(email="new@example.com").count(), 0)

                with patch("account.views.send_verification_email_task.delay"):
                    retry = self.client.post(REGISTER, reg_payload(), format="json")
                self.assertEqual(retry.status_code, 201, retry.data)
                self.assertFalse(retry.data["resumed"])
                self.assertTrue(retry.data["email_queued"])
                User.objects.filter(email="new@example.com").delete()

    # -- F3b: duplicate / concurrent submits -------------------------------------

    @patch("account.views.send_verification_email_task.delay")
    def test_retry_after_lost_response_resumes_the_account(self, mock_delay):
        """Old: the second submit (same email+password) was rejected with "already exists"."""
        first = self.client.post(REGISTER, reg_payload(), format="json")
        self.assertEqual(first.status_code, 201)
        self.assertFalse(first.data["resumed"])

        second = self.client.post(REGISTER, reg_payload(), format="json")
        self.assertEqual(second.status_code, 201, second.data)
        self.assertTrue(second.data["resumed"])
        self.assertTrue(second.data["email_queued"])
        self.assertTrue(second.data["email_verification_required"])
        self.assertEqual(User.objects.filter(email="new@example.com").count(), 1)
        self.assertEqual(EmailVerificationToken.objects.count(), 1)
        # The first mail is still in flight: no second mail inside the cooldown.
        self.assertEqual(mock_delay.call_count, 1)

    @patch("account.views.send_verification_email_task.delay")
    def test_resume_sends_again_once_the_cooldown_has_passed(self, mock_delay):
        self.client.post(REGISTER, reg_payload(), format="json")
        cache.clear()  # the enqueue guard expired; nothing was ever delivered
        again = self.client.post(REGISTER, reg_payload(), format="json")
        self.assertEqual(again.status_code, 201)
        self.assertTrue(again.data["resumed"])
        self.assertEqual(mock_delay.call_count, 2)
        # Same link both times: the first mail keeps working.
        self.assertEqual(EmailVerificationToken.objects.count(), 1)

    @patch("account.views.send_verification_email_task.delay")
    def test_resume_is_refused_for_wrong_password_verified_and_inactive(self, mock_delay):
        make_user("verified@example.com", verified=True)
        make_user("wrongpw@example.com", verified=False)
        make_user("inactive@example.com", verified=False, is_active=False)
        cases = [
            ("verified@example.com", PASSWORD),
            ("wrongpw@example.com", "OtherPass99"),
            ("inactive@example.com", PASSWORD),
        ]
        for email, password in cases:
            with self.subTest(email=email):
                response = self.client.post(
                    REGISTER, reg_payload(email=email, password=password), format="json"
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "email_exists")
                self.assertIn("already exists", response.data["error"])
        mock_delay.assert_not_called()

    @patch("account.views.send_verification_email_task.delay")
    def test_case_variant_of_existing_email_is_a_duplicate_not_a_new_account(self, _delay):
        make_user("case@example.com", verified=True)
        response = self.client.post(
            REGISTER, reg_payload(email="  CASE@Example.COM "), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "email_exists")
        self.assertEqual(User.objects.filter(email__iexact="case@example.com").count(), 1)

    @patch("account.views.send_verification_email_task.delay")
    def test_lost_race_resumes_instead_of_400_or_500(self, mock_delay):
        """Both twins pass the pre-check; the loser's insert hits the unique rule."""
        from account import views

        twin = make_user("race@example.com", verified=False)
        EmailVerificationToken.objects.create(user=twin)
        real_lookup = views._find_user_by_email
        calls = []

        def racy_lookup(email):
            calls.append(email)
            return None if len(calls) == 1 else real_lookup(email)

        variants = {
            "model_says_exists": None,  # real create_user raises ValueError
            "integrity_error": IntegrityError("UNIQUE constraint failed"),
        }
        for name, integrity in variants.items():
            calls.clear()
            with self.subTest(variant=name):
                patches = [patch("account.views._find_user_by_email", side_effect=racy_lookup)]
                if integrity is not None:
                    patches.append(
                        patch.object(User.objects, "create_user", side_effect=integrity)
                    )
                for p in patches:
                    p.start()
                try:
                    response = self.client.post(
                        REGISTER, reg_payload(email="race@example.com"), format="json"
                    )
                finally:
                    for p in patches:
                        p.stop()
                self.assertEqual(response.status_code, 201, response.data)
                self.assertTrue(response.data["resumed"])
                self.assertEqual(User.objects.filter(email="race@example.com").count(), 1)
                cache.clear()

    def test_lost_race_with_unfindable_twin_is_a_clean_400(self):
        with patch("account.views._find_user_by_email", return_value=None), patch.object(
            User.objects, "create_user", side_effect=IntegrityError("dup")
        ):
            response = self.client.post(REGISTER, reg_payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "email_exists")

    # -- F3c: non-string payloads ------------------------------------------------

    def test_null_and_non_string_fields_are_400_validation_errors_not_500(self):
        """Old: ``None.strip()`` -> AttributeError -> generic 500."""
        cases = [
            ({"email": None}, "email"),
            ({"email": 123}, "email"),
            ({"email": ["a@b.co"]}, "email"),
            ({"password": None}, "password"),
            ({"password": 12345678}, "password"),
            ({"first_name": None}, "first_name"),
            ({"first_name": ["x"]}, "first_name"),
            ({"surname": {"a": 1}}, "surname"),
            ({"first_name": None, "surname": None, "name": 5}, "first_name"),
        ]
        for override, field in cases:
            with self.subTest(override=override):
                response = self.client.post(REGISTER, reg_payload(**override), format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data["code"], "validation_error")
                self.assertEqual(response.data["field"], field)
                self.assertTrue(response.data["request_id"])
        self.assertEqual(User.objects.count(), 0)

    def test_non_object_bodies_are_400(self):
        for body in ([], [1, 2], "text", 7, None):
            with self.subTest(body=body):
                response = self.client.post(REGISTER, body, format="json")
                self.assertEqual(response.status_code, 400, response.content)

    def test_malformed_json_is_400_not_500(self):
        response = self.client.post(REGISTER, "{not json", content_type="application/json")
        self.assertEqual(response.status_code, 400)

    # -- F10: email normalisation ------------------------------------------------

    @patch("account.views.send_verification_email_task.delay")
    def test_email_variants_are_stored_canonical(self, _delay):
        cases = [
            ("Upper.Case@Example.COM", "upper.case@example.com"),
            ("  spaced@example.com  ", "spaced@example.com"),
            ("nbsp@example.com ", "nbsp@example.com"),
            (" lead-nbsp@example.com", "lead-nbsp@example.com"),
            ("zero\u200bwidth@example.com", "zerowidth@example.com"),
            ("bom@example.com\ufeff", "bom@example.com"),
            (fullwidth("wide@example.com"), "wide@example.com"),
            ("plus+alias@example.com", "plus+alias@example.com"),
            ("o'brien@example.com", "o'brien@example.com"),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                response = self.client.post(REGISTER, reg_payload(email=raw), format="json")
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data["user"]["email"], expected)
                self.assertTrue(User.objects.filter(email=expected).exists())
                cache.clear()

    def test_non_ascii_local_part_is_rejected_with_a_field_error(self):
        response = self.client.post(
            REGISTER, reg_payload(email="josé@example.com"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "validation_error")
        self.assertEqual(response.data["field"], "email")


@override_settings(**NO_THROTTLE)
class AuthBeatTaskTests(TestCase):
    def test_cleanup_keeps_recently_expired_links_and_drops_long_dead_ones(self):
        """An old link must still resolve for a while: a verified customer who reopens it
        is told "already verified" instead of "invalid link" (so no deletion at expiry)."""
        user = make_user("beat@example.com", verified=False)
        live = EmailVerificationToken.objects.create(user=user)
        recent = EmailVerificationToken.objects.create(user=user)
        ancient = EmailVerificationToken.objects.create(user=user)
        EmailVerificationToken.objects.filter(pk=recent.pk).update(
            expires_at=timezone.now() - timedelta(days=1)
        )
        EmailVerificationToken.objects.filter(pk=ancient.pk).update(
            expires_at=timezone.now() - timedelta(days=31)
        )
        reset_live = PasswordResetToken.objects.create(user=user)
        reset_recent = PasswordResetToken.objects.create(user=user)
        reset_ancient = PasswordResetToken.objects.create(user=user)
        PasswordResetToken.objects.filter(pk=reset_recent.pk).update(
            expires_at=timezone.now() - timedelta(days=1)
        )
        PasswordResetToken.objects.filter(pk=reset_ancient.pk).update(
            expires_at=timezone.now() - timedelta(days=31)
        )
        account_tasks.cleanup_expired_auth_tokens_task()
        for kept, model in ((live, EmailVerificationToken), (recent, EmailVerificationToken),
                            (reset_live, PasswordResetToken), (reset_recent, PasswordResetToken)):
            self.assertTrue(model.objects.filter(pk=kept.pk).exists())
        self.assertFalse(EmailVerificationToken.objects.filter(pk=ancient.pk).exists())
        self.assertFalse(PasswordResetToken.objects.filter(pk=reset_ancient.pk).exists())

    def test_unsent_verification_alert_logs_stale_null_email_sent_at(self):
        user = make_user("stale-mail@example.com", verified=False)
        token = EmailVerificationToken.objects.create(user=user)
        EmailVerificationToken.objects.filter(pk=token.pk).update(
            created_at=timezone.now() - timedelta(minutes=11),
            email_sent_at=None,
        )
        with self.assertLogs("account", level="ERROR") as cm:
            account_tasks.alert_unsent_verification_emails_task()
        blob = "\n".join(cm.output)
        self.assertIn("email_sent_at NULL", blob)
        self.assertNotIn("stale-mail", blob)  # ids only, never the address


@override_settings(**NO_THROTTLE)
class SignupThenSigninRegressionTests(TransactionTestCase):
    """F3d / F5: sign-up then sign-in (TransactionTestCase: ``email_queued`` needs real on_commit)."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    @patch("account.views.send_verification_email_task.delay")
    def test_login_immediately_after_signup_is_email_not_verified_without_session(self, _d):
        self.client.post(REGISTER, reg_payload(), format="json")
        response = self.client.post(
            LOGIN, {"email": "NEW@example.com ", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "email_not_verified")
        self.assertTrue(response.data["email_verification_required"])
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh_token", response.cookies)

    @patch("account.views.send_verification_email_task.delay", side_effect=RuntimeError("down"))
    def test_email_queued_is_false_when_the_broker_is_down_and_resume_retries(self, mock_delay):
        """``email_queued`` must reflect a real publish (outside the atomic block)."""
        with self.assertLogs("account", level="ERROR"):
            first = self.client.post(REGISTER, reg_payload(), format="json")
        self.assertEqual(first.status_code, 201)
        self.assertFalse(first.data["email_queued"])
        self.assertIn("Resend", first.data["message"])

        mock_delay.side_effect = None  # broker is back; the guard must not have stuck
        second = self.client.post(REGISTER, reg_payload(), format="json")
        self.assertEqual(second.status_code, 201)
        self.assertTrue(second.data["resumed"])
        self.assertTrue(second.data["email_queued"])
        self.assertEqual(mock_delay.call_count, 2)

    @patch("account.views.send_verification_email_task.delay")
    def test_register_records_the_real_client_ip_behind_nginx(self, _delay):
        """REMOTE_ADDR is always the nginx container; the client is the last XFF entry."""
        self.client.post(
            REGISTER,
            reg_payload(),
            format="json",
            REMOTE_ADDR="172.18.0.5",
            HTTP_X_FORWARDED_FOR="203.0.113.7, 203.0.113.7",
        )
        token = EmailVerificationToken.objects.get()
        self.assertEqual(token.ip_address, "203.0.113.7")

    @patch("account.views.send_verification_email_task.delay")
    def test_register_ignores_a_garbage_forwarded_ip_instead_of_failing(self, _delay):
        response = self.client.post(
            REGISTER, reg_payload(), format="json", HTTP_X_FORWARDED_FOR="not-an-ip"
        )
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(EmailVerificationToken.objects.get().ip_address)

    @patch("account.views.send_verification_email_task.delay")
    def test_register_events_are_logged_without_pii(self, _delay):
        with self.assertLogs("account.auth", level="INFO") as cm:
            self.client.post(REGISTER, reg_payload(email="Secret.Person@example.com"), format="json")
            self.client.post(REGISTER, reg_payload(email="Secret.Person@example.com"), format="json")
            self.client.post(REGISTER, reg_payload(password=None), format="json")
        events = auth_events(cm)
        self.assertEqual(
            [e["stage"] for e in events if e["op"] == "register"],
            ["created", "resumed", "validation"],
        )
        blob = "\n".join(cm.output).lower()
        self.assertNotIn("secret.person", blob)
        self.assertNotIn(PASSWORD.lower(), blob)
        self.assertTrue(events[0]["email_hash"])
        self.assertEqual(events[0]["email_hash"], events[1]["email_hash"])

    def test_every_register_response_carries_a_request_id_header(self):
        for payload in (reg_payload(email=None), reg_payload(first_name="")):
            response = self.client.post(REGISTER, payload, format="json")
            self.assertTrue(response["X-Request-ID"])
            self.assertEqual(response.data["request_id"], response["X-Request-ID"])


@override_settings(
    REGISTER_RATE_LIMIT="100/hour",
    REGISTER_EMAIL_RATE_LIMIT="8/hour",
    EMAIL_VERIFICATION_RESEND_RATE_LIMIT="12/hour",
    EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT="120/hour",
)
class SharedNatHttpTests(TransactionTestCase):
    """Real register/resend views: many distinct inboxes behind one office IP all succeed."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def _headers(self):
        return {
            "REMOTE_ADDR": "172.18.0.2",
            "HTTP_X_FORWARDED_FOR": "198.51.100.1, 198.51.100.1",
        }

    @patch("account.views.send_verification_email_task.delay")
    def test_twenty_distinct_emails_from_one_ip_all_201(self, _delay):
        codes = [
            self.client.post(
                REGISTER,
                reg_payload(email=f"office{i}@example.com"),
                format="json",
                **self._headers(),
            ).status_code
            for i in range(20)
        ]
        self.assertEqual(codes, [201] * 20)
        self.assertEqual(User.objects.filter(email__startswith="office").count(), 20)
        self.assertEqual(EmailVerificationToken.objects.count(), 20)

    @patch("account.views.send_verification_email_task.delay")
    def test_twenty_distinct_resends_from_one_ip_all_200(self, _delay):
        for i in range(20):
            make_user(f"nat{i}@example.com", verified=False)
        codes = [
            self.client.post(
                RESEND,
                {"email": f"nat{i}@example.com"},
                format="json",
                **self._headers(),
            ).status_code
            for i in range(20)
        ]
        self.assertEqual(codes, [200] * 20)

    @patch("account.views.send_verification_email_task.delay")
    def test_one_email_is_capped_without_blocking_the_next_customer(self, _delay):
        headers = self._headers()
        codes = [
            self.client.post(
                REGISTER, reg_payload(email="same@example.com"), format="json", **headers
            ).status_code
            for _ in range(9)
        ]
        self.assertEqual(codes, [201] * 8 + [429])
        neighbour = self.client.post(
            REGISTER, reg_payload(email="neighbour@example.com"), format="json", **headers
        )
        self.assertEqual(neighbour.status_code, 201)


@override_settings(**NO_THROTTLE)
class LoginRegressionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_success_sets_cookie_and_returns_access_only_in_body(self):
        user = make_user("ok@example.com")
        response = self.client.post(
            LOGIN, {"email": " OK@Example.com", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Login successful")
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn("refresh_token", response.cookies)
        self.assertEqual(response.data["user"]["id"], user.pk)
        user.refresh_from_db()
        self.assertIsNotNone(user.last_login)
        self.assertTrue(response["X-Request-ID"])

    def test_case_duplicate_rows_no_longer_crash_login(self):
        """Old: ``get(email__iexact=...)`` -> MultipleObjectsReturned -> 500."""
        lower, mixed = make_legacy_duplicates()
        with self.assertLogs("account.auth", level="INFO") as cm:
            r_lower = self.client.post(
                LOGIN, {"email": "dup@example.com", "password": "LowerPass1"}, format="json"
            )
            r_mixed = self.client.post(
                LOGIN, {"email": "DUP@example.com", "password": "MixedPass1"}, format="json"
            )
            r_bad = self.client.post(
                LOGIN, {"email": "dup@example.com", "password": "Nope12345"}, format="json"
            )
        self.assertEqual(r_lower.status_code, 200)
        self.assertEqual(r_lower.data["user"]["id"], lower.pk)
        self.assertEqual(r_mixed.status_code, 200)  # each row's own password works
        self.assertEqual(r_mixed.data["user"]["id"], mixed.pk)
        self.assertEqual(r_bad.status_code, 401)
        self.assertEqual(r_bad.data["code"], "invalid_password")
        stages = [e["stage"] for e in auth_events(cm)]
        self.assertIn("duplicate_email_rows", stages)
        dup_event = next(e for e in auth_events(cm) if e["stage"] == "duplicate_email_rows")
        self.assertEqual(sorted(dup_event["candidate_user_ids"]), sorted([lower.pk, mixed.pk]))

    def test_inactive_account_gets_a_truthful_403_only_with_the_right_password(self):
        """Old: ``authenticate()`` returned None for inactive users, so the customer
        was told "Invalid password" although the password was right."""
        make_user("off@example.com", is_active=False)
        right = self.client.post(LOGIN, {"email": "off@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(right.status_code, 403)
        self.assertEqual(right.data["code"], "account_inactive")
        self.assertNotIn("access", right.data)
        wrong = self.client.post(LOGIN, {"email": "off@example.com", "password": "Wrong12345"}, format="json")
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(wrong.data["code"], "invalid_password")

    def test_unknown_email_and_bad_password_have_codes(self):
        make_user("known@example.com")
        unknown = self.client.post(LOGIN, {"email": "nobody@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(unknown.data["code"], "account_not_found")
        self.assertEqual(unknown.data["suggestion"], "create_account")
        bad = self.client.post(LOGIN, {"email": "known@example.com", "password": "Wrong12345"}, format="json")
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.data["code"], "invalid_password")
        self.assertIn("Invalid password", bad.data["error"])

    def test_unverified_login_is_200_email_not_verified_without_tokens(self):
        make_user("unv@example.com", verified=False)
        response = self.client.post(LOGIN, {"email": "unv@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["code"], "email_not_verified")
        self.assertTrue(response.data["email_verification_required"])
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh_token", response.cookies)

    def test_missing_and_non_string_credentials_are_400_not_500(self):
        cases = [
            ({}, "email"),
            ({"email": None, "password": PASSWORD}, "email"),
            ({"email": 5, "password": PASSWORD}, "email"),
            ({"email": ["a@b.co"], "password": PASSWORD}, "email"),
            ({"email": "a@b.co"}, "password"),
            ({"email": "a@b.co", "password": None}, "password"),
            ({"email": "a@b.co", "password": 12345}, "password"),
        ]
        for payload, field in cases:
            with self.subTest(payload=payload):
                response = self.client.post(LOGIN, payload, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "validation_error")
                self.assertEqual(response.data["field"], field)
        self.assertEqual(self.client.post(LOGIN, [1, 2], format="json").status_code, 400)

    def test_login_events_are_structured_and_contain_no_pii(self):
        make_user("Pii.Check@example.com")
        with self.assertLogs("account.auth", level="INFO") as cm:
            self.client.post(LOGIN, {"email": "pii.check@example.com", "password": PASSWORD}, format="json")
            self.client.post(LOGIN, {"email": "pii.check@example.com", "password": "Wrong12345"}, format="json")
            self.client.post(LOGIN, {"email": "ghost@example.com", "password": PASSWORD}, format="json")
            self.client.post(LOGIN, {"email": "", "password": ""}, format="json")
        events = [e for e in auth_events(cm) if e["op"] == "login"]
        self.assertEqual(
            [(e["outcome"], e["stage"], e["status"]) for e in events],
            [
                ("success", "success", 200),
                ("rejected", "password_check", 401),
                ("rejected", "unknown_email", 401),
                ("rejected", "validation", 400),
            ],
        )
        blob = "\n".join(cm.output).lower()
        for secret in ("pii.check", "ghost@", PASSWORD.lower(), "wrong12345"):
            self.assertNotIn(secret, blob)
        self.assertEqual(events[0]["client_ip"], "127.0.0.1")


class LoginThrottleTests(TestCase):
    """Throttling keys on the real client IP as nginx forwards it (last XFF entry)."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def _login(self, client_ip, email="someone@example.com"):
        return self.client.post(
            LOGIN,
            {"email": email, "password": "Wrong12345"},
            format="json",
            REMOTE_ADDR="172.18.0.2",  # the nginx container, identical for everyone
            HTTP_X_FORWARDED_FOR=f"{client_ip}, {client_ip}",
        )

    @override_settings(LOGIN_RATE_LIMIT="3/minute", LOGIN_EMAIL_RATE_LIMIT="1000/minute")
    def test_customers_do_not_share_a_bucket_and_429_is_friendly(self):
        with self.assertLogs("account.auth", level="WARNING"):
            for _ in range(3):
                self.assertEqual(self._login("198.51.100.1").status_code, 401)
            blocked = self._login("198.51.100.1")
            other = self._login("198.51.100.2")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["code"], "rate_limited")
        self.assertIsInstance(blocked.data["retry_after"], int)
        self.assertGreaterEqual(int(blocked["Retry-After"]), 1)
        self.assertTrue(blocked.data["request_id"])
        self.assertEqual(other.status_code, 401)  # a different customer is unaffected

    @override_settings(LOGIN_RATE_LIMIT="1000/minute", LOGIN_EMAIL_RATE_LIMIT="2/minute")
    def test_one_account_is_slowed_without_blocking_other_emails(self):
        with self.assertLogs("account.auth", level="WARNING"):
            self.assertEqual(self._login("198.51.100.9", "a@example.com").status_code, 401)
            self.assertEqual(self._login("198.51.100.9", "A@Example.com ").status_code, 401)
            self.assertEqual(self._login("198.51.100.9", "a@example.com").status_code, 429)
        self.assertEqual(self._login("198.51.100.9", "b@example.com").status_code, 401)

    @override_settings(LOGIN_RATE_LIMIT="2/minute", LOGIN_EMAIL_RATE_LIMIT="1000/minute")
    def test_token_obtain_endpoint_is_throttled_too(self):
        """Old: ``/api/auth/token/`` had no throttle at all (free password guessing)."""
        statuses = []
        with self.assertLogs("account.auth", level="WARNING"):
            for _ in range(3):
                response = self.client.post(
                    "/api/auth/token/",
                    {"email": "x@example.com", "password": "Wrong12345"},
                    format="json",
                    HTTP_X_FORWARDED_FOR="198.51.100.20",
                )
                statuses.append(response.status_code)
        self.assertEqual(statuses, [401, 401, 429])
        self.assertEqual(response.data["code"], "rate_limited")


@override_settings(**NO_THROTTLE)
class ResendVerificationTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user("resend@example.com", verified=False)

    @patch("account.views.send_verification_email_task.delay")
    def test_resend_keeps_the_first_link_valid_and_reuses_it(self, mock_delay):
        """Old: resend invalidated every token, so the first (still queued) email's
        link showed "expired or already used"."""
        first = EmailVerificationToken.objects.create(user=self.user)
        response = self.client.post(RESEND, {"email": "Resend@Example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        first.refresh_from_db()
        self.assertFalse(first.is_used)
        self.assertTrue(first.is_valid())
        self.assertEqual(EmailVerificationToken.objects.count(), 1)
        self.assertTrue(response.data["email_queued"])
        mock_delay.assert_called_once_with(first.pk)

    @patch("account.views.send_verification_email_task.delay")
    def test_resend_issues_a_new_token_when_the_old_one_is_nearly_expired(self, mock_delay):
        old = EmailVerificationToken.objects.create(user=self.user)
        EmailVerificationToken.objects.filter(pk=old.pk).update(
            expires_at=timezone.now() + timedelta(minutes=10)
        )
        self.client.post(RESEND, {"email": "resend@example.com"}, format="json")
        old.refresh_from_db()
        self.assertFalse(old.is_used)  # never invalidated
        self.assertEqual(EmailVerificationToken.objects.count(), 2)
        new = EmailVerificationToken.objects.exclude(pk=old.pk).get()
        mock_delay.assert_called_once_with(new.pk)

    @patch("account.views.send_verification_email_task.delay")
    def test_resend_inside_the_cooldown_reports_code_and_remaining(self, mock_delay):
        token = EmailVerificationToken.objects.create(user=self.user)
        EmailVerificationToken.objects.filter(pk=token.pk).update(
            email_sent_at=timezone.now() - timedelta(seconds=20)
        )
        response = self.client.post(RESEND, {"email": "resend@example.com"}, format="json")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["code"], "cooldown")
        self.assertTrue(30 <= response.data["cooldown_remaining"] <= 40)
        self.assertEqual(response.data["cooldown_total"], 60)
        mock_delay.assert_not_called()

    @patch("account.views.send_verification_email_task.delay")
    def test_two_quick_resends_queue_one_mail(self, mock_delay):
        EmailVerificationToken.objects.create(user=self.user)
        for _ in range(2):
            self.assertEqual(
                self.client.post(RESEND, {"email": "resend@example.com"}, format="json").status_code,
                200,
            )
        self.assertEqual(mock_delay.call_count, 1)

    @patch("account.views.send_verification_email_task.delay")
    def test_verified_unknown_and_duplicate_rows_are_200_never_500(self, mock_delay):
        make_user("done@example.com", verified=True)
        verified = self.client.post(RESEND, {"email": "done@example.com"}, format="json")
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.data["already_verified"])
        unknown = self.client.post(RESEND, {"email": "ghost@example.com"}, format="json")
        self.assertEqual(unknown.status_code, 200)
        self.assertNotIn("already_verified", unknown.data)
        self.assertTrue(unknown.data["email_queued"])
        mock_delay.assert_not_called()

        make_legacy_duplicates()
        User.objects.filter(email__iexact="dup@example.com").update(is_email_verified=False)
        dup = self.client.post(RESEND, {"email": "dup@example.com"}, format="json")
        self.assertEqual(dup.status_code, 200)  # old: MultipleObjectsReturned -> 500
        mock_delay.assert_called_once()

    @patch("account.views.send_verification_email_task.delay", side_effect=RuntimeError("broker down"))
    def test_resend_email_queued_is_false_when_the_broker_is_down(self, _mock_delay):
        EmailVerificationToken.objects.create(user=self.user)
        with self.assertLogs("account", level="ERROR"):
            response = self.client.post(RESEND, {"email": "resend@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["email_queued"])

    def test_invalid_payloads_are_400(self):
        for body in ({}, {"email": None}, {"email": 4}, {"email": "not-an-email"}):
            with self.subTest(body=body):
                response = self.client.post(RESEND, body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "validation_error")
                self.assertEqual(response.data["field"], "email")


class VerificationTaskTests(TestCase):
    """``send_verification_email_task`` always mails a working link (F4a)."""

    def setUp(self):
        cache.clear()
        self.user = make_user("task@example.com", verified=False)

    def _run(self, token_id):
        account_tasks.send_verification_email_task.run(token_id)

    def _sent_token(self):
        self.assertEqual(len(mail.outbox), 1)
        return mail.outbox[0].body.split("verify-email?token=")[1].split()[0].strip()

    def test_used_token_is_replaced_by_a_fresh_valid_link(self):
        """Old: mailed whatever id it was given, even a token resend had just killed."""
        used = EmailVerificationToken.objects.create(user=self.user)
        used.mark_as_used()
        self._run(used.pk)
        sent = self._sent_token()
        self.assertNotEqual(sent, used.token)
        fresh = EmailVerificationToken.objects.get(token=sent)
        self.assertTrue(fresh.is_valid())
        self.assertIsNotNone(fresh.email_sent_at)

    def test_expired_token_is_replaced_by_the_newest_valid_one(self):
        expired = EmailVerificationToken.objects.create(user=self.user)
        EmailVerificationToken.objects.filter(pk=expired.pk).update(
            expires_at=timezone.now() - timedelta(hours=1)
        )
        valid = EmailVerificationToken.objects.create(user=self.user)
        self._run(expired.pk)
        self.assertEqual(self._sent_token(), valid.token)
        self.assertEqual(EmailVerificationToken.objects.count(), 2)  # nothing new needed

    def test_valid_token_is_mailed_as_is(self):
        token = EmailVerificationToken.objects.create(user=self.user)
        self._run(token.pk)
        self.assertEqual(self._sent_token(), token.token)
        token.refresh_from_db()
        self.assertIsNotNone(token.email_sent_at)

    def test_verified_user_and_missing_token_are_skipped(self):
        token = EmailVerificationToken.objects.create(user=self.user)
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        self._run(token.pk)
        with self.assertLogs("account", level="ERROR"):
            self._run(987654)
        self.assertEqual(mail.outbox, [])

    def test_failure_retries_with_exponential_backoff(self):
        token = EmailVerificationToken.objects.create(user=self.user)
        task = account_tasks.send_verification_email_task
        self.assertEqual(task.max_retries, 5)
        expected = {0: 30, 1: 60, 2: 120, 3: 240, 4: 480}
        for retries, countdown in expected.items():
            task.push_request(retries=retries)
            try:
                with patch("account.email_utils.send_email_verification_email", return_value=False), \
                        patch.object(task, "retry", side_effect=Retry()) as retry, \
                        self.assertLogs("account", level="ERROR"), \
                        self.assertRaises(Retry):
                    task.run(token.pk)
            finally:
                task.pop_request()
            self.assertEqual(retry.call_args.kwargs["countdown"], countdown)
        self.assertEqual(account_tasks.email_retry_delay(5), 600)  # capped at 10 minutes
        self.assertEqual(account_tasks.email_retry_delay(20), 600)

    def test_rendering_errors_are_retried_not_lost(self):
        token = EmailVerificationToken.objects.create(user=self.user)
        task = account_tasks.send_verification_email_task
        with patch(
            "account.email_utils.send_email_verification_email", side_effect=RuntimeError("tpl")
        ), patch.object(task, "retry", side_effect=Retry()) as retry, self.assertLogs(
            "account", level="ERROR"
        ), self.assertRaises(Retry):
            task.run(token.pk)
        retry.assert_called_once()

    def test_final_failure_logs_one_structured_error_without_the_email(self):
        """Old: gave up silently after 3 tries with only a plain-text line."""
        token = EmailVerificationToken.objects.create(user=self.user)
        task = account_tasks.send_verification_email_task
        task.push_request(retries=5)
        try:
            with patch("account.email_utils.send_email_verification_email", return_value=False), \
                    patch.object(task, "retry", side_effect=Retry()) as retry, \
                    self.assertLogs("account.auth", level="ERROR") as cm:
                task.run(token.pk)  # gives up: returns normally, no further retry
        finally:
            task.pop_request()
        retry.assert_not_called()
        events = [e for e in auth_events(cm) if e["op"] == "verification_email"]
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual((event["outcome"], event["stage"]), ("error", "give_up"))
        self.assertEqual(event["attempts"], 6)
        self.assertEqual(event["user_id"], self.user.pk)
        self.assertEqual(event["verification_id"], token.pk)
        self.assertNotIn("task@example.com", "\n".join(cm.output))
        token.refresh_from_db()
        self.assertIsNone(token.email_sent_at)

    def test_email_failure_log_does_not_contain_the_recipient(self):
        from account.email_utils import send_templated_email

        with patch(
            "django.core.mail.EmailMultiAlternatives.send",
            side_effect=RuntimeError("Recipient rejected: leaky.person@example.com"),
        ), self.assertLogs("account", level="ERROR") as cm:
            ok = send_templated_email(
                to=["leaky.person@example.com"],
                subject="x",
                template_base="email_verification",
                context={"user_name": "a", "verification_url": "https://x", "current_year": 2026},
            )
        self.assertFalse(ok)
        self.assertNotIn("leaky.person", "\n".join(cm.output))

    def test_mail_tasks_are_acked_late_so_a_killed_worker_does_not_drop_them(self):
        for name in (
            "send_verification_email_task",
            "send_verification_confirmation_email_task",
            "send_password_reset_email_task",
            "send_password_reset_confirmation_email_task",
        ):
            task = getattr(account_tasks, name)
            self.assertTrue(task.acks_late, name)
            self.assertTrue(task.reject_on_worker_lost, name)

    def test_email_queue_backlog_alerts_only_when_over_threshold(self):
        with patch.object(account_tasks, "_email_queue_message_count", return_value=99):
            account_tasks.alert_email_queue_backlog_task.run()
        with patch.object(account_tasks, "_email_queue_message_count", return_value=150), \
                self.assertLogs("account.auth", level="ERROR") as cm:
            account_tasks.alert_email_queue_backlog_task.run()
        events = [e for e in auth_events(cm) if e["op"] == "email_queue"]
        self.assertEqual(events[0]["stage"], "backlog")
        self.assertEqual(events[0]["count"], 150)

    def test_email_queue_inspect_failure_is_not_an_alert(self):
        with patch.object(account_tasks, "_email_queue_message_count", return_value=None):
            account_tasks.alert_email_queue_backlog_task.run()

    def test_email_queue_missing_is_empty_not_a_warning(self):
        from amqp.exceptions import ChannelError
        from celery import current_app
        from unittest.mock import MagicMock

        missing = ChannelError("Channel.queue_declare: (404) NOT_FOUND - no queue 'email' in vhost '0'")
        channel = MagicMock()
        channel.queue_declare.side_effect = missing
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.default_channel = channel
        with patch.object(current_app, "connection_or_acquire", return_value=conn):
            self.assertEqual(account_tasks._email_queue_message_count(), 0)


class VerifyEmailRegressionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user("verify@example.com", verified=False)

    def test_verified_user_with_expired_or_used_token_gets_200_not_400(self):
        """Old: the "expired or already used" 400 also hit already-verified customers
        who reopened an old link."""
        expired = EmailVerificationToken.objects.create(user=self.user)
        EmailVerificationToken.objects.filter(pk=expired.pk).update(
            expires_at=timezone.now() - timedelta(hours=1)
        )
        used = EmailVerificationToken.objects.create(user=self.user)
        used.mark_as_used()
        User.objects.filter(pk=self.user.pk).update(is_email_verified=True)
        for token in (expired, used):
            with self.subTest(token=token.pk):
                response = self.client.post(VERIFY, {"token": token.token}, format="json")
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.data["already_verified"])
                self.assertIn("user", response.data)
                # A replayed link is only ever told "already verified": verification
                # links are long-lived secrets and must not become login credentials.
                self.assertNotIn("access", response.data)
                self.assertNotIn("refresh_token", response.cookies)

    def test_unverified_user_gets_typed_400s(self):
        expired = EmailVerificationToken.objects.create(user=self.user)
        EmailVerificationToken.objects.filter(pk=expired.pk).update(
            expires_at=timezone.now() - timedelta(hours=1)
        )
        response = self.client.post(VERIFY, {"token": expired.token}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "token_expired")
        self.assertEqual(response.data["email"], "verify@example.com")
        self.assertTrue(response.data["can_resend"])

        unknown = self.client.post(VERIFY, {"token": "no-such-token"}, format="json")
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(unknown.data["code"], "token_invalid")
        self.assertFalse(unknown.data["can_resend"])

        for body in ({}, {"token": None}, {"token": 12}, {"token": ["a"]}):
            with self.subTest(body=body):
                missing = self.client.post(VERIFY, body, format="json")
                self.assertEqual(missing.status_code, 400)
                self.assertEqual(missing.data["code"], "token_invalid")

    def test_verify_works_for_a_legacy_row_that_fails_full_clean(self):
        """Verification only writes ``is_email_verified`` (no full_clean)."""
        _lower, mixed = make_legacy_duplicates()
        User.objects.filter(pk=mixed.pk).update(is_email_verified=False)
        token = EmailVerificationToken.objects.create(user=User.objects.get(pk=mixed.pk))
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(VERIFY, {"token": token.token}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["already_verified"])
        self.assertNotIn("access", response.data)  # verifying never signs in
        self.assertNotIn("refresh_token", response.cookies)
        mixed.refresh_from_db()
        self.assertTrue(mixed.is_email_verified)


@override_settings(**NO_THROTTLE)
class PasswordResetRegressionTests(TransactionTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user("reset@example.com", verified=False)

    @patch("account.views.send_password_reset_email_task.delay")
    def test_unverified_customer_resets_password_and_can_sign_in(self, mock_delay):
        """Old: confirm never set ``is_email_verified`` so the customer who reset a
        forgotten password was still told to verify an email they may never get."""
        self.assertEqual(
            self.client.post(RESET, {"email": "RESET@example.com "}, format="json").status_code, 200
        )
        token = PasswordResetToken.objects.get(user=self.user)
        mock_delay.assert_called_once_with(token.pk)

        with patch("account.views.send_password_reset_confirmation_email_task.delay") as confirm:
            response = self.client.post(
                RESET_CONFIRM, {"token": token.token, "new_password": "BrandNewPass9"}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        confirm.assert_called_once_with(self.user.pk)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)

        login = self.client.post(
            LOGIN, {"email": "reset@example.com", "password": "BrandNewPass9"}, format="json"
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn("access", login.data)
        self.assertIn("refresh_token", login.cookies)
        self.assertNotIn("code", login.data)

    def test_reset_request_never_sends_mail_inline(self):
        """Old: SES was called on the request path (no timeout -> 60 s nginx cut-off)."""
        with patch("account.views.send_password_reset_email_task.delay") as delay, patch(
            "account.email_utils.send_password_reset_email",
            side_effect=AssertionError("must not send inline"),
        ):
            response = self.client.post(RESET, {"email": "reset@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        delay.assert_called_once()
        self.assertEqual(mail.outbox, [])

    def test_reset_request_is_still_200_when_the_broker_is_down(self):
        with patch(
            "account.views.send_password_reset_email_task.delay", side_effect=RuntimeError("down")
        ), self.assertLogs("account", level="ERROR"):
            response = self.client.post(RESET, {"email": "reset@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["message"], "If the email exists, a password reset link has been sent"
        )

    @patch("account.views.send_password_reset_email_task.delay")
    def test_unknown_email_gets_the_same_answer_and_no_mail(self, mock_delay):
        known = self.client.post(RESET, {"email": "reset@example.com"}, format="json")
        unknown = self.client.post(RESET, {"email": "ghost@example.com"}, format="json")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(mock_delay.call_count, 1)

    @patch("account.views.send_password_reset_email_task.delay")
    def test_reset_request_reuses_a_healthy_token_and_never_kills_others(self, mock_delay):
        """Old: every request invalidated all tokens, killing the link in the first mail."""
        first = PasswordResetToken.objects.create(user=self.user)
        PasswordResetToken.objects.filter(pk=first.pk).update(
            created_at=timezone.now() - timedelta(minutes=10)
        )
        self.client.post(RESET, {"email": "reset@example.com"}, format="json")
        first.refresh_from_db()
        self.assertFalse(first.is_used)
        self.assertEqual(PasswordResetToken.objects.count(), 1)
        mock_delay.assert_called_once_with(first.pk)

    @patch("account.views.send_password_reset_email_task.delay")
    def test_reset_request_issues_a_new_token_when_the_old_one_is_nearly_expired(self, mock_delay):
        nearly = PasswordResetToken.objects.create(user=self.user)
        PasswordResetToken.objects.filter(pk=nearly.pk).update(
            created_at=timezone.now() - timedelta(minutes=10),
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        self.client.post(RESET, {"email": "reset@example.com"}, format="json")
        nearly.refresh_from_db()
        self.assertFalse(nearly.is_used)
        self.assertEqual(PasswordResetToken.objects.count(), 2)
        newest = PasswordResetToken.objects.exclude(pk=nearly.pk).get()
        mock_delay.assert_called_once_with(newest.pk)

    @patch("account.views.send_password_reset_email_task.delay")
    def test_reset_cooldown_is_429_with_code(self, mock_delay):
        PasswordResetToken.objects.create(user=self.user)  # created just now
        response = self.client.post(RESET, {"email": "reset@example.com"}, format="json")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["code"], "cooldown")
        self.assertIn("cooldown_remaining", response.data)
        self.assertEqual(response.data["cooldown_total"], 60)
        mock_delay.assert_not_called()

    @patch("account.views.send_password_reset_email_task.delay")
    def test_reset_with_case_duplicate_rows_is_200_not_500(self, mock_delay):
        make_legacy_duplicates()
        response = self.client.post(RESET, {"email": "DUP@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        mock_delay.assert_called_once()

    def test_reset_request_validation(self):
        for body in ({}, {"email": None}, {"email": 3}, {"email": "nope"}):
            with self.subTest(body=body):
                response = self.client.post(RESET, body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "validation_error")

    @patch("account.views.send_password_reset_confirmation_email_task.delay")
    def test_confirm_errors_carry_codes_and_used_tokens_stay_dead(self, _confirm):
        token = PasswordResetToken.objects.create(user=self.user)
        sibling = PasswordResetToken.objects.create(user=self.user)
        weak = self.client.post(RESET_CONFIRM, {"token": token.token, "new_password": "123"}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.assertEqual(weak.data["code"], "validation_error")
        self.assertEqual(weak.data["field"], "new_password")

        unknown = self.client.post(RESET_CONFIRM, {"token": "zzz", "new_password": "BrandNewPass9"}, format="json")
        self.assertEqual((unknown.status_code, unknown.data["code"]), (400, "token_invalid"))

        for body in ({}, {"token": None, "new_password": None}, {"token": 5, "new_password": ["x"]}):
            missing = self.client.post(RESET_CONFIRM, body, format="json")
            self.assertEqual((missing.status_code, missing.data["code"]), (400, "validation_error"))

        ok = self.client.post(RESET_CONFIRM, {"token": token.token, "new_password": "BrandNewPass9"}, format="json")
        self.assertEqual(ok.status_code, 200)
        sibling.refresh_from_db()
        self.assertTrue(sibling.is_used)  # every other outstanding link is retired
        again = self.client.post(RESET_CONFIRM, {"token": token.token, "new_password": "AnotherPass9"}, format="json")
        self.assertEqual((again.status_code, again.data["code"]), (400, "token_expired"))

    @patch("account.views.send_password_reset_confirmation_email_task.delay", side_effect=RuntimeError("down"))
    def test_confirm_succeeds_even_if_the_broker_is_down(self, _confirm):
        token = PasswordResetToken.objects.create(user=self.user)
        with self.assertLogs("account", level="ERROR"):
            response = self.client.post(
                RESET_CONFIRM, {"token": token.token, "new_password": "BrandNewPass9"}, format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNewPass9"))

    def test_reset_tasks_send_through_the_mail_backend(self):
        token = PasswordResetToken.objects.create(user=self.user)
        account_tasks.send_password_reset_email_task.run(token.pk)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(f"reset-password?token={token.token}", mail.outbox[0].body)
        account_tasks.send_password_reset_confirmation_email_task.run(self.user.pk)
        self.assertEqual(len(mail.outbox), 2)

    def test_reset_email_task_skips_a_token_that_expired_while_queued(self):
        token = PasswordResetToken.objects.create(user=self.user)
        PasswordResetToken.objects.filter(pk=token.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        account_tasks.send_password_reset_email_task.run(token.pk)
        self.assertEqual(mail.outbox, [])

    def test_reset_task_final_failure_is_logged(self):
        token = PasswordResetToken.objects.create(user=self.user)
        task = account_tasks.send_password_reset_email_task
        task.push_request(retries=5)
        try:
            with patch("account.email_utils.send_password_reset_email", return_value=False), \
                    self.assertLogs("account.auth", level="ERROR") as cm:
                task.run(token.pk)
        finally:
            task.pop_request()
        event = auth_events(cm)[0]
        self.assertEqual((event["op"], event["stage"]), ("password_reset_email", "give_up"))
        self.assertNotIn("reset@example.com", "\n".join(cm.output))


class ProfileAndPasswordRegressionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = make_user("me@example.com")
        self.client.force_authenticate(user=self.user)

    def test_change_password_writes_only_the_password_column(self):
        """A legacy row that fails full_clean must still be able to change password."""
        _lower, mixed = make_legacy_duplicates()
        self.client.force_authenticate(user=mixed)
        response = self.client.post(
            "/api/auth/change-password/",
            {"old_password": "MixedPass1", "new_password": "BrandNewPass9"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        mixed.refresh_from_db()
        self.assertTrue(mixed.check_password("BrandNewPass9"))

    def test_change_password_errors_have_codes(self):
        wrong = self.client.post(
            "/api/auth/change-password/",
            {"old_password": "Wrong12345", "new_password": "BrandNewPass9"},
            format="json",
        )
        self.assertEqual((wrong.status_code, wrong.data["code"]), (400, "invalid_password"))
        missing = self.client.post(
            "/api/auth/change-password/", {"old_password": None, "new_password": 5}, format="json"
        )
        self.assertEqual((missing.status_code, missing.data["code"]), (400, "validation_error"))

    def test_profile_email_uniqueness_is_case_insensitive_and_email_is_normalised(self):
        make_user("taken@example.com")
        clash = self.client.patch(
            "/api/auth/profile/update/", {"email": " TAKEN@Example.com"}, format="json"
        )
        self.assertEqual(clash.status_code, 400)
        self.assertEqual(clash.data["code"], "email_exists")
        self.assertIn("already exists", clash.data["error"])

        ok = self.client.patch(
            "/api/auth/profile/update/", {"email": "  New.Mail@Example.COM "}, format="json"
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new.mail@example.com")

    def test_profile_validation_error_from_save_is_400_not_500(self):
        from django.core.exceptions import ValidationError

        with patch.object(User, "save", side_effect=ValidationError(["Nope, that is not allowed."])):
            response = self.client.patch(
                "/api/auth/profile/update/", {"first_name": "Zed"}, format="json"
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "validation_error")
        self.assertIn("Nope", response.data["error"])

    def test_profile_non_string_payloads_do_not_500(self):
        response = self.client.patch(
            "/api/auth/profile/update/",
            {"first_name": None, "email": 5, "phone": 7, "address": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data["code"], "validation_error")
