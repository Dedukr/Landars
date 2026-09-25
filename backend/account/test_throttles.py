"""Auth throttles: real-client-IP buckets, per-email login limit, call-time rates,
fail-open behaviour and the friendly 429 response.

The HTTP tests mount small probe views (wired with the production throttle
classes) at real /api/auth/ paths through this module's own URLconf, so they do
not depend on which view module currently defines the auth endpoints.
"""

import json
import logging
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.urls import path
from rest_framework.exceptions import (
    NotAuthenticated,
    ParseError,
    Throttled,
    ValidationError,
)
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from account.api_errors import error_response, exception_handler, throttled_message
from account.observability import hash_email
from account.throttles import (
    ClientEventThrottle,
    EmailVerificationResendIpThrottle,
    EmailVerificationResendThrottle,
    EmailVerificationThrottle,
    FailOpenAnonRateThrottle,
    FailOpenUserRateThrottle,
    LoginEmailThrottle,
    LoginThrottle,
    PasswordResetEmailThrottle,
    PasswordResetThrottle,
    RegisterEmailThrottle,
    RegisterThrottle,
    request_email,
)


class _Probe(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        return Response({"ok": True})


class LoginProbe(_Probe):
    throttle_classes = [LoginThrottle, LoginEmailThrottle]


class RegisterProbe(_Probe):
    throttle_classes = [RegisterThrottle, RegisterEmailThrottle]


class ResendProbe(_Probe):
    throttle_classes = [EmailVerificationResendIpThrottle, EmailVerificationResendThrottle]


class VerifyProbe(_Probe):
    throttle_classes = [EmailVerificationThrottle]


class NonAuthProbe(_Probe):
    throttle_classes = [LoginThrottle]


urlpatterns = [
    path("api/auth/login/", LoginProbe.as_view()),
    path("api/auth/register/", RegisterProbe.as_view()),
    path("api/auth/resend-verification/", ResendProbe.as_view()),
    path("api/auth/verify-email/", VerifyProbe.as_view()),
    path("api/other/thing/", NonAuthProbe.as_view()),
]

ONE_PROXY = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
EDGE = "172.71.0.5"  # a Cloudflare edge address, as nginx saw it before the real_ip fix
SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


class _QuietAuthEvents:
    """Keep the JSON event stream out of the test output for tests that trigger many events."""

    def setUp(self):
        super().setUp()
        self.enterContext(patch.object(logging.getLogger("account.auth"), "handlers", [logging.NullHandler()]))


def _drf_request(path="/api/auth/login/", data=None, **extra):
    raw = APIRequestFactory().post(path, data if data is not None else {}, format="json", **extra)
    return Request(raw, parsers=[JSONParser()])


class ThrottleRateTests(SimpleTestCase):
    CASES = [
        (RegisterThrottle, "register", "REGISTER_RATE_LIMIT", (300, 3600)),
        (RegisterEmailThrottle, "register_email", "REGISTER_EMAIL_RATE_LIMIT", (8, 3600)),
        (LoginThrottle, "login", "LOGIN_RATE_LIMIT", (20, 60)),
        (LoginEmailThrottle, "login_email", "LOGIN_EMAIL_RATE_LIMIT", (8, 60)),
        (PasswordResetThrottle, "password_reset", "PASSWORD_RESET_RATE_LIMIT", (100, 3600)),
        (PasswordResetEmailThrottle, "password_reset_email", "PASSWORD_RESET_EMAIL_RATE_LIMIT", (8, 3600)),
        (EmailVerificationThrottle, "email_verify", "EMAIL_VERIFICATION_RATE_LIMIT", (1000, 3600)),
        (EmailVerificationResendThrottle, "email_resend", "EMAIL_VERIFICATION_RESEND_RATE_LIMIT", (12, 3600)),
        (EmailVerificationResendIpThrottle, "email_resend_ip", "EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT", (300, 3600)),
        (ClientEventThrottle, "client_event", "CLIENT_EVENT_RATE_LIMIT", (60, 60)),
    ]  # fmt: skip

    def test_scopes_and_documented_defaults(self):
        for cls, scope, _setting, (num, duration) in self.CASES:
            with self.subTest(cls=cls.__name__):
                throttle = cls()
                self.assertEqual(throttle.scope, scope)
                self.assertEqual((throttle.num_requests, throttle.duration), (num, duration))

    def test_rates_are_resolved_at_call_time_from_settings(self):
        for cls, _scope, setting, _default in self.CASES:
            with self.subTest(cls=cls.__name__):
                with override_settings(**{setting: "7/day"}):
                    throttle = cls()
                    self.assertEqual((throttle.num_requests, throttle.duration), (7, 86400))
                self.assertNotEqual(cls().duration, 86400)  # override is gone again

    def test_no_class_level_rate(self):
        for cls, *_ in self.CASES:
            self.assertFalse(hasattr(cls, "rate"), cls.__name__)

    def test_malformed_rate_falls_back_to_the_default_instead_of_breaking_requests(self):
        for bad in ("garbage", "10/fortnightly", "-5/minute", "ten/minute", 42):
            with self.subTest(bad=bad):
                with override_settings(LOGIN_RATE_LIMIT=bad):
                    with self.assertLogs("account.throttles", level="WARNING") as cm:
                        throttle = LoginThrottle()
                self.assertEqual((throttle.num_requests, throttle.duration), (20, 60))
                self.assertIn("LOGIN_RATE_LIMIT", cm.output[0])

    def test_class_hierarchy_is_preserved(self):
        self.assertTrue(issubclass(FailOpenAnonRateThrottle, AnonRateThrottle))
        self.assertTrue(issubclass(FailOpenUserRateThrottle, UserRateThrottle))
        for cls in (RegisterThrottle, RegisterEmailThrottle, LoginThrottle, LoginEmailThrottle,
                    PasswordResetThrottle, PasswordResetEmailThrottle, EmailVerificationThrottle,
                    EmailVerificationResendThrottle, EmailVerificationResendIpThrottle,
                    ClientEventThrottle):  # fmt: skip
            self.assertTrue(issubclass(cls, FailOpenAnonRateThrottle), cls.__name__)

    def test_names_stay_importable_from_account_views(self):
        from account import views

        for name in ("RegisterThrottle", "RegisterEmailThrottle", "LoginThrottle", "PasswordResetThrottle",
                     "EmailVerificationThrottle", "EmailVerificationResendThrottle",
                     "EmailVerificationResendIpThrottle"):  # fmt: skip
            self.assertTrue(issubclass(getattr(views, name), AnonRateThrottle), name)


class FailOpenTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_allows_when_the_underlying_throttle_raises(self):
        request = APIRequestFactory().post("/api/auth/register/")  # plain Django request
        with patch("rest_framework.throttling.AnonRateThrottle.allow_request", side_effect=RuntimeError("redis down")):
            with self.assertLogs("account.throttles", level="WARNING") as cm:
                self.assertTrue(RegisterThrottle().allow_request(request, None))
        self.assertIn("allowing request", cm.output[0])

    def test_allows_when_the_cache_backend_raises(self):
        broken = MagicMock()
        broken.get.side_effect = ConnectionError("Error 111 connecting to redis")
        for throttle_cls in (
            LoginThrottle,
            LoginEmailThrottle,
            RegisterEmailThrottle,
            EmailVerificationResendThrottle,
            ClientEventThrottle,
            PasswordResetEmailThrottle,
        ):
            with self.subTest(throttle=throttle_cls.__name__):
                with patch.object(throttle_cls, "cache", broken):
                    with self.assertLogs("account.throttles", level="WARNING"):
                        allowed = throttle_cls().allow_request(_drf_request(data={"email": "a@b.co"}), None)
                self.assertTrue(allowed)

    def test_parse_errors_are_not_swallowed(self):
        raw = APIRequestFactory().post("/api/auth/login/", data="{not json", content_type="application/json")
        with self.assertRaises(ParseError):
            LoginEmailThrottle().allow_request(Request(raw, parsers=[JSONParser()]), None)

    def test_http_request_still_succeeds_when_cache_is_down(self):
        broken = MagicMock()
        broken.get.side_effect = TimeoutError("timed out")
        with override_settings(ROOT_URLCONF=__name__), patch.object(LoginThrottle, "cache", broken), patch.object(
            LoginEmailThrottle, "cache", broken
        ):
            with self.assertLogs("account.throttles", level="WARNING"):
                response = APIClient().post("/api/auth/login/", {"email": "a@b.co"}, format="json")
        self.assertEqual(response.status_code, 200)


@override_settings(
    ROOT_URLCONF=__name__,
    REST_FRAMEWORK=ONE_PROXY,
    LOGIN_RATE_LIMIT="3/minute",
    LOGIN_EMAIL_RATE_LIMIT="1000/minute",
)
class PerClientBucketTests(_QuietAuthEvents, SimpleTestCase):
    """Regression for the audited bug: behind Cloudflare every customer looked like the edge IP."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def _login(self, xff, email="someone@example.com"):
        return self.client.post(
            "/api/auth/login/", {"email": email, "password": "x"}, format="json", HTTP_X_FORWARDED_FOR=xff
        )

    def _statuses(self, xff, count):
        return [self._login(xff, email=f"user{i}@example.com").status_code for i in range(count)]

    def test_per_ip_login_limit(self):
        self.assertEqual(self._statuses("198.51.100.1", 4), [200, 200, 200, 429])

    def test_audited_bug_shared_edge_ip_in_last_slot_makes_customers_share_one_bucket(self):
        """nginx used to see the Cloudflare edge as $remote_addr, so the LAST X-Forwarded-For entry
        was the same edge address for unrelated customers."""
        customer_a = f"203.0.113.10, {EDGE}"
        customer_b = f"198.51.100.7, {EDGE}"
        self.assertEqual(self._statuses(customer_a, 3), [200, 200, 200])
        self.assertEqual(self._login(customer_b).status_code, 429)  # customer B punished for A

    def test_real_ip_in_last_slot_gives_each_customer_their_own_bucket(self):
        """After the nginx real_ip fix the last entry is the visitor's own address."""
        customer_a = "10.9.9.9, 203.0.113.10"
        customer_b = "10.9.9.9, 198.51.100.7"
        self.assertEqual(self._statuses(customer_a, 4), [200, 200, 200, 429])
        self.assertEqual(self._login(customer_b).status_code, 200)

    def test_client_supplied_forwarded_entries_cannot_dodge_the_limit(self):
        real = "203.0.113.10"
        statuses = [self._login(f"6.6.6.{i}, {real}").status_code for i in range(4)]
        self.assertEqual(statuses, [200, 200, 200, 429])


@override_settings(
    ROOT_URLCONF=__name__,
    REST_FRAMEWORK=ONE_PROXY,
    LOGIN_RATE_LIMIT="1000/minute",
    LOGIN_EMAIL_RATE_LIMIT="2/minute",
)
class LoginEmailThrottleTests(_QuietAuthEvents, SimpleTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def _login(self, email, ip="198.51.100.1", raw=None):
        payload = raw if raw is not None else {"email": email, "password": "x"}
        return self.client.post("/api/auth/login/", payload, format="json", HTTP_X_FORWARDED_FOR=f"1.1.1.1, {ip}")

    def test_limits_one_email_from_one_ip(self):
        codes = [self._login("victim@example.com").status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])

    def test_other_emails_from_the_same_ip_are_unaffected(self):
        for _ in range(3):
            self._login("victim@example.com")
        self.assertEqual(self._login("other@example.com").status_code, 200)

    def test_same_email_from_another_ip_is_unaffected_no_lockout_dos(self):
        for _ in range(3):
            self._login("victim@example.com", ip="198.51.100.1")
        self.assertEqual(self._login("victim@example.com", ip="203.0.113.77").status_code, 200)

    def test_case_whitespace_and_zero_width_variants_share_a_bucket(self):
        variants = ["victim@example.com", "  VICTIM@Example.com ", "victim@example.com\u200b"]
        codes = [self._login(v).status_code for v in variants]
        self.assertEqual(codes, [200, 200, 429])

    def test_requests_without_a_usable_email_are_not_throttled_here(self):
        bodies = [{}, {"password": "x"}, {"email": None}, {"email": 123}, {"email": ["a@b.co"]}, ["a@b.co"], "text", 5]
        for body in bodies:
            for _ in range(4):
                self.assertEqual(self._login(None, raw=body).status_code, 200, body)

    def test_cache_key_contains_no_raw_email(self):
        throttle = LoginEmailThrottle()
        with override_settings(REST_FRAMEWORK=ONE_PROXY):
            request = _drf_request(data={"email": "Private.Person@Example.com"}, HTTP_X_FORWARDED_FOR="1.1.1.1, 203.0.113.9")
            key = throttle.get_cache_key(request, None)
        self.assertNotIn("Private", key)
        self.assertNotIn("example", key.lower())
        self.assertIn(hash_email("private.person@example.com"), key)
        self.assertIn("203.0.113.9", key)
        self.assertIsNone(throttle.get_cache_key(_drf_request(data={}), None))

    def test_request_email_helper(self):
        self.assertEqual(request_email(_drf_request(data={"email": "  A@B.co "})), "a@b.co")
        self.assertEqual(request_email(_drf_request(data={"email": 5})), "")
        self.assertEqual(request_email(_drf_request(data=["a@b.co"])), "")
        self.assertEqual(request_email(APIRequestFactory().post("/x/")), "")  # plain Django request
        # No body-size shortcut: padding a request must not hide the email from the
        # per-email limiter (nginx caps /api/auth/ bodies at 16 KB before Django).
        huge = _drf_request(data={"email": "a@b.co", "pad": "x" * 70000})
        self.assertEqual(request_email(huge), "a@b.co")
        self.assertEqual(request_email(_drf_request(data={"email": "a\x00b@c.co"})), "")


@override_settings(
    ROOT_URLCONF=__name__,
    REST_FRAMEWORK=ONE_PROXY,
    REGISTER_RATE_LIMIT="100/hour",
    REGISTER_EMAIL_RATE_LIMIT="2/hour",
)
class RegisterSharedIpTests(_QuietAuthEvents, SimpleTestCase):
    """Twenty people behind one office/CGNAT IP can still create accounts."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def _register(self, email, ip="198.51.100.1"):
        return self.client.post(
            "/api/auth/register/",
            {"email": email},
            format="json",
            HTTP_X_FORWARDED_FOR=f"1.1.1.1, {ip}",
        )

    def test_twenty_distinct_emails_from_one_ip_all_succeed(self):
        codes = [self._register(f"person{i}@example.com").status_code for i in range(20)]
        self.assertEqual(codes, [200] * 20)

    def test_one_email_is_capped_without_blocking_the_next_customer(self):
        codes = [self._register("same@example.com").status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])
        self.assertEqual(self._register("neighbour@example.com").status_code, 200)

    def test_case_and_whitespace_variants_share_the_email_bucket(self):
        variants = ["Same@Example.com", "  same@example.com ", "same@example.com\u200b"]
        codes = [self._register(v).status_code for v in variants]
        self.assertEqual(codes, [200, 200, 429])

    def test_email_bucket_is_per_client_so_a_stranger_cannot_burn_a_victims_allowance(self):
        # One client hammering an address only fills ITS OWN bucket ...
        self.assertEqual(self._register("victim@example.com", ip="198.51.100.1").status_code, 200)
        self.assertEqual(self._register("victim@example.com", ip="198.51.100.1").status_code, 200)
        self.assertEqual(self._register("victim@example.com", ip="198.51.100.1").status_code, 429)
        # ... the victim (another client) is not locked out of their own address.
        self.assertEqual(self._register("victim@example.com", ip="203.0.113.9").status_code, 200)

    def test_cache_key_is_client_plus_hashed_email_without_the_raw_address(self):
        throttle = RegisterEmailThrottle()
        with override_settings(REST_FRAMEWORK=ONE_PROXY):
            request = _drf_request(
                path="/api/auth/register/",
                data={"email": "Private.Person@Example.com"},
                HTTP_X_FORWARDED_FOR="1.1.1.1, 203.0.113.9",
            )
            key = throttle.get_cache_key(request, None)
        self.assertNotIn("Private", key)
        self.assertNotIn("example", key.lower())
        self.assertIn("203.0.113.9", key)  # the real client (last XFF entry), per bucket
        self.assertNotIn("1.1.1.1", key)  # a client-supplied XFF entry never keys anything
        self.assertIn(hash_email("private.person@example.com"), key)
        self.assertIsNone(throttle.get_cache_key(_drf_request(data={}), None))


@override_settings(
    ROOT_URLCONF=__name__,
    REST_FRAMEWORK=ONE_PROXY,
    EMAIL_VERIFICATION_RESEND_RATE_LIMIT="2/hour",
    EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT="120/hour",
)
class ResendPerEmailTests(_QuietAuthEvents, SimpleTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def _resend(self, email, ip="198.51.100.1"):
        return self.client.post(
            "/api/auth/resend-verification/",
            {"email": email},
            format="json",
            HTTP_X_FORWARDED_FOR=f"1.1.1.1, {ip}",
        )

    def test_twenty_customers_on_one_ip_can_each_resend(self):
        codes = [self._resend(f"user{i}@example.com").status_code for i in range(20)]
        self.assertEqual(codes, [200] * 20)

    def test_one_email_cannot_request_unbounded_mail(self):
        codes = [self._resend("victim@example.com").status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])
        self.assertEqual(self._resend("other@example.com").status_code, 200)

    def test_resend_email_key_contains_no_raw_email(self):
        throttle = EmailVerificationResendThrottle()
        request = _drf_request(
            path="/api/auth/resend-verification/",
            data={"email": "Private.Person@Example.com"},
        )
        key = throttle.get_cache_key(request, None)
        self.assertNotIn("Private", key)
        self.assertIn(hash_email("private.person@example.com"), key)


@override_settings(
    ROOT_URLCONF=__name__,
    REST_FRAMEWORK=ONE_PROXY,
    EMAIL_VERIFICATION_RATE_LIMIT="300/hour",
)
class VerifySharedIpTests(_QuietAuthEvents, SimpleTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()

    def test_twenty_distinct_verifies_from_one_ip_succeed(self):
        codes = [
            self.client.post(
                "/api/auth/verify-email/",
                {"token": f"tok-{i}"},
                format="json",
                HTTP_X_FORWARDED_FOR="1.1.1.1, 198.51.100.1",
            ).status_code
            for i in range(20)
        ]
        self.assertEqual(codes, [200] * 20)


@override_settings(
    ROOT_URLCONF=__name__,
    REST_FRAMEWORK=ONE_PROXY,
    LOGIN_RATE_LIMIT="1/minute",
    LOGIN_EMAIL_RATE_LIMIT="1/minute",
    REGISTER_RATE_LIMIT="1/hour",
    REGISTER_EMAIL_RATE_LIMIT="1000/hour",
)
class ThrottleResponseTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def _throttled_login(self, **extra):
        headers = {"HTTP_X_FORWARDED_FOR": "1.1.1.1, 203.0.113.50", "HTTP_USER_AGENT": SAFARI, **extra}
        body = {"email": "Customer@Example.com", "password": "hunter2"}
        self.assertEqual(self.client.post("/api/auth/login/", body, format="json", **headers).status_code, 200)
        with self.assertLogs("account.auth", level="WARNING") as cm:
            response = self.client.post("/api/auth/login/", body, format="json", **headers)
        return response, cm

    def test_429_body_headers_and_request_id(self):
        response, _ = self._throttled_login()
        self.assertEqual(response.status_code, 429)
        body = response.json()
        self.assertEqual(body["code"], "rate_limited")
        self.assertEqual(body["error"], body["detail"])
        self.assertIsInstance(body["retry_after"], int)
        self.assertTrue(1 <= body["retry_after"] <= 60)
        self.assertEqual(response["Retry-After"], str(body["retry_after"]))
        self.assertEqual(body["request_id"], response["X-Request-ID"])
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertTrue(body["error"].startswith("Too many attempts. Please wait "))
        self.assertNotIn("Expected available", body["error"])

    def test_throttled_event_is_logged_with_scope_and_hashed_email(self):
        response, cm = self._throttled_login()
        self.assertEqual(len(cm.records), 1)
        record = cm.records[0]
        event = json.loads(record.getMessage())
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertEqual((event["op"], event["outcome"], event["status"]), ("login", "throttled", 429))
        self.assertIn(event["throttle_scope"], {"login", "login_email"})
        self.assertEqual(sorted(event["throttle_scopes"]), ["login", "login_email"])
        self.assertEqual(event["retry_after"], response.json()["retry_after"])
        self.assertEqual(event["request_id"], response["X-Request-ID"])
        self.assertEqual(event["client_ip"], "203.0.113.50")
        self.assertEqual(event["ua_family"], "Safari-iOS")
        self.assertEqual(event["email_hash"], hash_email("customer@example.com"))
        message = record.getMessage()
        for leaked in ("Customer", "example.com", "hunter2", "Mozilla"):
            self.assertNotIn(leaked, message)

    def test_single_scope_event_has_no_scope_list(self):
        headers = {"HTTP_X_FORWARDED_FOR": "1.1.1.1, 203.0.113.51"}
        self.client.post("/api/auth/register/", {"email": "n@example.com"}, format="json", **headers)
        with self.assertLogs("account.auth", level="WARNING") as cm:
            response = self.client.post("/api/auth/register/", {"email": "n@example.com"}, format="json", **headers)
        self.assertEqual(response.status_code, 429)
        event = json.loads(cm.records[0].getMessage())
        self.assertEqual((event["op"], event["throttle_scope"]), ("register", "register"))
        self.assertNotIn("throttle_scopes", event)
        self.assertEqual(event["email_hash"], hash_email("n@example.com"))

    def test_non_auth_paths_keep_drf_native_429(self):
        headers = {"HTTP_X_FORWARDED_FOR": "1.1.1.1, 203.0.113.52"}
        self.client.post("/api/other/thing/", {}, format="json", **headers)
        response = self.client.post("/api/other/thing/", {}, format="json", **headers)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(list(response.json()), ["detail"])
        self.assertIn("Expected available in", response.json()["detail"])
        self.assertTrue(response.has_header("Retry-After"))


class ExceptionHandlerTests(SimpleTestCase):
    def _context(self, path="/api/auth/login/"):
        request = _drf_request(path)
        return {"request": request, "view": None}, request

    def test_message_wording(self):
        self.assertEqual(throttled_message(1), "Too many attempts. Please wait 1 second and try again.")
        self.assertEqual(throttled_message(42), "Too many attempts. Please wait 42 seconds and try again.")
        self.assertEqual(throttled_message(119), "Too many attempts. Please wait 119 seconds and try again.")
        self.assertEqual(throttled_message(120), "Too many attempts. Please wait about 2 minutes and try again.")
        self.assertEqual(throttled_message(3600), "Too many attempts. Please wait about 60 minutes and try again.")
        self.assertEqual(throttled_message(1801), "Too many attempts. Please wait about 31 minutes and try again.")

    def test_throttled_without_a_wait_defaults_to_sixty_seconds(self):
        context, _ = self._context()
        with self.assertLogs("account.auth", level="WARNING"):
            response = exception_handler(Throttled(), context)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["retry_after"], 60)
        self.assertEqual(response["Retry-After"], "60")

    def test_throttled_wait_is_rounded_up_and_at_least_one_second(self):
        context, _ = self._context()
        with self.assertLogs("account.auth", level="WARNING"):
            self.assertEqual(exception_handler(Throttled(wait=41.2), context).data["retry_after"], 42)
            self.assertEqual(exception_handler(Throttled(wait=0), context).data["retry_after"], 1)

    def test_request_id_is_added_to_dict_bodies_on_auth_paths_only(self):
        context, _ = self._context()
        response = exception_handler(NotAuthenticated(), context)
        self.assertIn("detail", response.data)
        self.assertIn("request_id", response.data)
        other, _ = self._context("/api/orders/")
        self.assertNotIn("request_id", exception_handler(NotAuthenticated(), other).data)

    def test_list_bodies_and_unhandled_exceptions_are_left_alone(self):
        context, _ = self._context()
        listed = exception_handler(ValidationError(["bad"]), context)
        self.assertEqual(list(listed.data), ["bad"])
        self.assertIsNone(exception_handler(RuntimeError("unexpected"), context))
        self.assertIsNone(exception_handler(RuntimeError("no context"), None))

    def test_existing_request_id_in_body_is_kept(self):
        context, _ = self._context()
        response = exception_handler(ValidationError({"field": ["bad"], "request_id": "mine"}), context)
        self.assertEqual(response.data["request_id"], "mine")

    def test_error_response_shape(self):
        request = _drf_request()
        request.request_id = "req-abcdef12"
        response = error_response(request, "Nope.", code="email_exists", status_code=400, field="email")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {"error": "Nope.", "code": "email_exists", "request_id": "req-abcdef12", "field": "email"},
        )
        self.assertEqual(error_response(None, "x", code="c", status_code=500).data["request_id"], "-")
