"""Request ids, log filter, client IP, email hashing and structured auth events."""

import hashlib
import json
import logging
import sys
from datetime import datetime
from decimal import Decimal
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.http import HttpResponse
from django.test import Client, RequestFactory, SimpleTestCase, override_settings
from rest_framework.request import Request
from rest_framework.throttling import BaseThrottle

from account.observability import (
    REQUEST_ID_HEADER,
    AuthEventFormatter,
    RequestIDLogFilter,
    RequestIDMiddleware,
    classify_user_agent,
    get_client_ip,
    get_request_id,
    hash_email,
    log_auth_event,
    op_for_path,
)

SAFARI_IOS = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
CHROME_ANDROID = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/118.0.0.0 Mobile Safari/537.36"
)
CHROME_DESKTOP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/118.0.0.0 Safari/537.36"
)
FIREFOX_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0"
EDGE_DESKTOP = CHROME_DESKTOP + " Edg/118.0.2088.46"


def _run_middleware(path="/api/auth/login/", meta=None, get_response=None):
    request = RequestFactory().post(path, **(meta or {}))
    middleware = RequestIDMiddleware(get_response or (lambda r: HttpResponse("ok")))
    return request, middleware(request)


class RequestIDMiddlewareTests(SimpleTestCase):
    def test_generates_32_hex_id_and_echoes_it(self):
        request, response = _run_middleware()
        self.assertRegex(response[REQUEST_ID_HEADER], r"^[0-9a-f]{32}$")
        self.assertEqual(request.request_id, response[REQUEST_ID_HEADER])

    def test_reuses_valid_incoming_id(self):
        _, response = _run_middleware(meta={"HTTP_X_REQUEST_ID": "abc12345-XYZ_.9"})
        self.assertEqual(response[REQUEST_ID_HEADER], "abc12345-XYZ_.9")

    def test_replaces_malformed_incoming_ids(self):
        bad_ids = [
            "short",
            "has space in it",
            "x" * 65,
            "bad!chars$$$$",
            "abcdefgh\n",  # "$" alone would accept a trailing newline
            "a,b,c,d,e,f,g,h",
            "",
        ]
        for bad in bad_ids:
            with self.subTest(bad=bad):
                _, response = _run_middleware(meta={"HTTP_X_REQUEST_ID": bad})
                self.assertRegex(response[REQUEST_ID_HEADER], r"^[0-9a-f]{32}$")

    def test_context_id_matches_during_request_and_resets_after(self):
        seen = {}

        def view(request):
            seen["ctx"] = get_request_id()
            seen["attr"] = request.request_id
            return HttpResponse("ok")

        self.assertEqual(get_request_id(), "-")
        _run_middleware(get_response=view)
        self.assertEqual(seen["ctx"], seen["attr"])
        self.assertEqual(get_request_id(), "-")

    def test_context_is_reset_even_when_the_view_raises(self):
        def boom(request):
            raise RuntimeError("view exploded")

        with self.assertRaises(RuntimeError):
            _run_middleware(get_response=boom)
        self.assertEqual(get_request_id(), "-")

    def test_records_monotonic_start_for_latency(self):
        request, _ = _run_middleware()
        self.assertIsInstance(request._request_started_monotonic, float)

    def test_no_store_added_only_under_api_auth(self):
        _, auth = _run_middleware(path="/api/auth/login/")
        self.assertEqual(auth["Cache-Control"], "no-store")
        _, other = _run_middleware(path="/api/products/")
        self.assertFalse(other.has_header("Cache-Control"))
        _, health = _run_middleware(path="/health/")
        self.assertFalse(health.has_header("Cache-Control"))

    def test_existing_cache_control_is_left_alone(self):
        def view(request):
            response = HttpResponse("ok")
            response["Cache-Control"] = "max-age=60"
            return response

        _, response = _run_middleware(path="/api/auth/csrf-token/", get_response=view)
        self.assertEqual(response["Cache-Control"], "max-age=60")


class RequestIDFullStackTests(SimpleTestCase):
    def test_middleware_is_first_in_settings(self):
        from django.conf import settings

        self.assertEqual(
            settings.MIDDLEWARE[0], "account.observability.RequestIDMiddleware"
        )

    def test_success_and_error_responses_carry_the_id(self):
        client = Client()
        ok = client.get("/health/")
        self.assertRegex(ok[REQUEST_ID_HEADER], r"^[0-9a-f]{32}$")
        missing = client.get("/api/auth/definitely-not-a-route/")
        self.assertEqual(missing.status_code, 404)
        self.assertRegex(missing[REQUEST_ID_HEADER], r"^[0-9a-f]{32}$")
        self.assertEqual(missing["Cache-Control"], "no-store")

    def test_incoming_id_is_echoed_and_cors_preflight_has_it(self):
        client = Client()
        response = client.get("/health/", HTTP_X_REQUEST_ID="nginx-req-0001")
        self.assertEqual(response[REQUEST_ID_HEADER], "nginx-req-0001")
        preflight = client.options(
            "/api/auth/login/",
            HTTP_ORIGIN="https://evil.example",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        )
        self.assertRegex(preflight[REQUEST_ID_HEADER], r"^[0-9a-f]{32}$")


class RequestIDLogFilterTests(SimpleTestCase):
    def _record(self):
        return logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)

    def test_defaults_to_dash_outside_a_request(self):
        record = self._record()
        self.assertTrue(RequestIDLogFilter().filter(record))
        self.assertEqual(record.request_id, "-")

    def test_uses_current_request_id_inside_a_request(self):
        captured = {}

        def view(request):
            record = self._record()
            RequestIDLogFilter().filter(record)
            captured["rid"] = record.request_id
            return HttpResponse("ok")

        request, _ = _run_middleware(get_response=view)
        self.assertEqual(captured["rid"], request.request_id)

    def test_falls_back_to_the_request_on_the_record(self):
        """django.request logs 4xx after the middleware chain: context is reset, record.request is not."""
        record = self._record()
        record.request = SimpleNamespace(request_id="req-from-record")
        RequestIDLogFilter().filter(record)
        self.assertEqual(record.request_id, "req-from-record")
        bogus = self._record()
        bogus.request = SimpleNamespace(request_id="bad id!")
        RequestIDLogFilter().filter(bogus)
        self.assertEqual(bogus.request_id, "-")

    def test_django_request_warnings_carry_the_request_id(self):
        client = Client()
        with self.assertLogs("django.request", level="WARNING") as cm:
            response = client.get("/api/auth/definitely-not-a-route/", HTTP_X_REQUEST_ID="trace-me-0001")
        self.assertEqual(response[REQUEST_ID_HEADER], "trace-me-0001")
        record = cm.records[0]
        RequestIDLogFilter().filter(record)  # attached to this logger's handler in production
        self.assertEqual(record.request_id, "trace-me-0001")

    def test_console_handlers_render_timestamp_and_request_id(self):
        from django.conf import settings

        cfg = settings.LOGGING
        for name in ("console", "console_django_request"):
            self.assertIn("request_id", cfg["handlers"][name]["filters"])
        fmt = cfg["formatters"]["simple"]
        record = self._record()
        RequestIDLogFilter().filter(record)
        line = logging.Formatter(fmt["format"], fmt["datefmt"], style="{").format(record)
        self.assertRegex(line, r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d{4} INFO x rid=- msg$")


class ClientIPTests(SimpleTestCase):
    def _request(self, **meta):
        return RequestFactory().get("/api/auth/login/", **meta)

    def test_last_forwarded_entry_is_the_client_behind_one_proxy(self):
        request = self._request(HTTP_X_FORWARDED_FOR="9.9.9.9, 203.0.113.7")
        with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 1}):
            self.assertEqual(get_client_ip(request), "203.0.113.7")

    def test_works_with_drf_request_and_matches_throttle_ident(self):
        django_request = self._request(
            HTTP_X_FORWARDED_FOR="1.1.1.1, 198.51.100.4", REMOTE_ADDR="172.18.0.9"
        )
        with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 1}):
            self.assertEqual(get_client_ip(Request(django_request)), "198.51.100.4")
            self.assertEqual(
                get_client_ip(django_request), BaseThrottle().get_ident(django_request)
            )

    def test_num_proxies_variants_and_fallbacks(self):
        request = self._request(
            HTTP_X_FORWARDED_FOR="1.1.1.1, 2.2.2.2", REMOTE_ADDR="172.18.0.9"
        )
        with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 0}):
            self.assertEqual(get_client_ip(request), "172.18.0.9")
        with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 2}):
            self.assertEqual(get_client_ip(request), "1.1.1.1")
        with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 1}):
            no_xff = self._request(REMOTE_ADDR="172.18.0.9")
            self.assertEqual(get_client_ip(no_xff), "172.18.0.9")

    def test_unknown_address_is_empty_string_and_never_raises(self):
        self.assertEqual(get_client_ip(SimpleNamespace(META={})), "")
        self.assertEqual(get_client_ip(object()), "")
        self.assertEqual(get_client_ip(None), "")


class HashEmailTests(SimpleTestCase):
    def test_shape_and_determinism(self):
        digest = hash_email("customer@example.com")
        self.assertRegex(digest, r"^[0-9a-f]{16}$")
        self.assertEqual(digest, hash_email("customer@example.com"))
        self.assertNotEqual(digest, hash_email("other@example.com"))

    def test_stable_across_casing_whitespace_zero_width_and_fullwidth(self):
        expected = hash_email("user@example.com")
        variants = [
            "  User@Example.COM  ",
            "USER@EXAMPLE.COM",
            "user@example.com\u200b",
            "\ufeffuser@example.com",
            "u\u00adser@example.com",
            "\uff55\uff53\uff45\uff52\uff20\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45\uff0e\uff43\uff4f\uff4d",
        ]
        for variant in variants:
            with self.subTest(variant=variant):
                self.assertEqual(hash_email(variant), expected)

    def test_empty_and_non_strings_hash_to_empty(self):
        for value in ("", "   ", None, 123, ["a@b.co"], b"a@b.co"):
            with self.subTest(value=value):
                self.assertEqual(hash_email(value), "")

    def test_is_keyed_not_a_plain_hash(self):
        email = "user@example.com"
        self.assertNotEqual(
            hash_email(email), hashlib.sha256(email.encode()).hexdigest()[:16]
        )
        before = hash_email(email)
        with override_settings(SECRET_KEY="a-completely-different-key-" + "x" * 30):
            self.assertNotEqual(hash_email(email), before)


class ClassifyUserAgentTests(SimpleTestCase):
    def test_known_families(self):
        cases = {
            SAFARI_IOS: "Safari-iOS",
            CHROME_ANDROID: "Chrome-Android",
            CHROME_DESKTOP: "Chrome-Desktop",
            FIREFOX_DESKTOP: "Firefox-Desktop",
            EDGE_DESKTOP: "Edge-Desktop",
            SAFARI_IOS.replace("Version/17.0", "CriOS/118.0.5993.69"): "Chrome-iOS",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.0 Safari/605.1.15": "Safari-Desktop",
            CHROME_ANDROID.replace("Chrome/118", "SamsungBrowser/23.0 Chrome/118"): "Samsung-Android",
        }
        for ua, family in cases.items():
            with self.subTest(family=family):
                self.assertEqual(classify_user_agent(ua), family)

    def test_in_app_browsers_and_webviews(self):
        instagram = SAFARI_IOS.replace("Safari/604.1", "Instagram 300.0.0.0")
        wkwebview = SAFARI_IOS.replace(" Safari/604.1", "")
        android_webview = CHROME_ANDROID.replace("Pixel 7)", "Pixel 7; wv)")
        self.assertEqual(classify_user_agent(instagram), "InApp-iOS")
        self.assertEqual(classify_user_agent(wkwebview), "InApp-iOS")
        self.assertEqual(classify_user_agent(android_webview), "InApp-Android")

    def test_bots_missing_and_unknown(self):
        self.assertEqual(classify_user_agent("curl/8.4.0"), "bot")
        self.assertEqual(classify_user_agent("python-requests/2.32"), "bot")
        self.assertEqual(
            classify_user_agent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://g.co/bot)"),
            "bot",
        )
        self.assertEqual(classify_user_agent(""), "none")
        self.assertEqual(classify_user_agent(None), "none")
        self.assertEqual(classify_user_agent("Totally Custom Agent 1.0"), "other")

    def test_never_returns_the_raw_ua(self):
        for ua in (SAFARI_IOS, CHROME_DESKTOP, "weird/1.2 (secret-build-id-77)"):
            self.assertNotIn("Mozilla", classify_user_agent(ua))
            self.assertNotIn("77", classify_user_agent(ua))


class OpForPathTests(SimpleTestCase):
    def test_paths(self):
        self.assertEqual(op_for_path("/api/auth/login/"), "login")
        self.assertEqual(op_for_path("/api/auth/token/refresh/"), "refresh")
        self.assertEqual(op_for_path("/api/auth/token/"), "token_obtain")
        self.assertEqual(op_for_path("/api/auth/password-reset/confirm/"), "password_reset_confirm")
        self.assertEqual(op_for_path("/api/auth/password-reset/"), "password_reset_request")
        self.assertEqual(op_for_path("/api/auth/client-event/"), "client_event")
        self.assertEqual(op_for_path("/api/auth/profile/"), "other")
        self.assertEqual(op_for_path("/api/products/"), "other")


class LogAuthEventTests(SimpleTestCase):
    def _log(self, *args, level="INFO", **kwargs):
        with self.assertLogs("account.auth", level=level) as captured:
            log_auth_event(*args, **kwargs)
        self.assertEqual(len(captured.records), 1)
        record = captured.records[0]
        return json.loads(record.getMessage()), record

    def _request(self, **meta):
        defaults = {"HTTP_USER_AGENT": SAFARI_IOS, "REMOTE_ADDR": "172.18.0.9"}
        defaults.update(meta)
        return RequestFactory().post("/api/auth/login/?token=SECRETQUERY", **defaults)

    def test_core_fields_and_compact_single_line(self):
        request = self._request(HTTP_CF_RAY="8a1b2c3d4e5f6789-LHR", HTTP_X_FORWARDED_FOR="9.9.9.9, 203.0.113.7")
        with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 1}):
            event, record = self._log(
                request, "login", "rejected", stage="password_check", status=401,
                email="Customer@Example.com", user=SimpleNamespace(pk=42),
            )  # fmt: skip
        self.assertEqual(event["event"], "auth")
        self.assertRegex(event["ts"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
        self.assertEqual(
            (event["op"], event["outcome"], event["stage"], event["status"]),
            ("login", "rejected", "password_check", 401),
        )
        self.assertEqual(event["endpoint"], "/api/auth/login/")  # no query string
        self.assertEqual(event["method"], "POST")
        self.assertEqual(event["client_ip"], "203.0.113.7")
        self.assertEqual(event["ua_family"], "Safari-iOS")
        self.assertEqual(event["cf_ray"], "8a1b2c3d4e5f6789-LHR")
        self.assertEqual(event["user_id"], 42)
        self.assertEqual(event["email_hash"], hash_email("customer@example.com"))
        self.assertEqual(record.levelno, logging.INFO)
        message = record.getMessage()
        self.assertNotIn("\n", message)
        self.assertNotIn(" ", message)  # compact separators
        self.assertNotIn("SECRETQUERY", message)
        self.assertNotIn("Mozilla", message)  # never the raw user agent

    def test_raw_email_never_appears(self):
        _, record = self._log(
            self._request(), "register", "rejected", email="Secret.Person@Example.com",
            reason="duplicate for Secret.Person@Example.com",
        )  # fmt: skip
        self.assertNotIn("Secret.Person", record.getMessage())
        self.assertNotIn("example.com", record.getMessage().lower())

    def test_sensitive_extra_keys_are_dropped_case_insensitively(self):
        event, record = self._log(
            None, "login", "success",
            password="hunter2", Token="t0k3n", refresh="r", ACCESS="a",
            Authorization="Bearer abc", cookie="c=1", client_secret="s", user_email="u@y.co",
            safe_key="kept", attempts=3,
        )  # fmt: skip
        for leaked in ("hunter2", "t0k3n", "Bearer abc", "c=1", "u@y.co"):
            self.assertNotIn(leaked, record.getMessage())
        self.assertEqual(event["safe_key"], "kept")
        self.assertEqual(event["attempts"], 3)
        self.assertNotIn("email_hash", event)  # only the email= parameter is ever hashed

    def test_string_values_are_scrubbed_and_truncated(self):
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.c2lnbmF0dXJl"
        event, record = self._log(
            None, "refresh", "rejected", note=f"got {jwt} and Bearer abc.def", long="x" * 500
        )
        self.assertNotIn(jwt, record.getMessage())
        self.assertNotIn("abc.def", record.getMessage())
        self.assertEqual(len(event["long"]), 200)

    def test_none_values_are_dropped_and_extras_cannot_override_core_fields(self):
        event, _ = self._log(
            None, "login", "success", nothing=None, ts="x", event="y", client_ip="6.6.6.6",
            email_hash="deadbeef", user_id=999, error_class="Fake", latency_ms=1,
        )  # fmt: skip
        self.assertNotIn("nothing", event)
        self.assertEqual(event["event"], "auth")
        self.assertNotEqual(event["ts"], "x")
        for forged in ("client_ip", "email_hash", "user_id", "error_class", "latency_ms"):
            self.assertNotIn(forged, event)

    def test_json_unfriendly_extras_are_made_safe(self):
        event, _ = self._log(
            None, "login", "success", when=datetime(2026, 1, 2, 3, 4, 5), amount=Decimal("1.50"),
            tags={"b", "a"}, nested={"password": "p", "keep": [1, 2]}, obj=object(), nan=float("nan"),
            pct="100% %s {x}",
        )  # fmt: skip
        self.assertEqual(event["when"], "2026-01-02T03:04:05")
        self.assertEqual(event["amount"], "1.50")
        self.assertEqual(event["tags"], ["a", "b"])
        self.assertEqual(event["nested"], {"keep": [1, 2]})
        self.assertEqual(event["obj"], "<object>")
        self.assertEqual(event["nan"], "nan")
        self.assertEqual(event["pct"], "100% %s {x}")

    def test_error_sets_error_class_and_logs_exc_info_at_error(self):
        try:
            raise ValueError("boom")
        except ValueError as exc:
            error = exc
        event, record = self._log(None, "register", "error", level="ERROR", stage="unexpected", error=error)
        self.assertEqual(event["error_class"], "ValueError")
        self.assertEqual(record.levelno, logging.ERROR)
        self.assertIs(record.exc_info[1], error)

    def test_error_class_is_recorded_for_non_error_outcomes_without_exc_info(self):
        event, record = self._log(None, "login", "rejected", error=KeyError("k"))
        self.assertEqual(event["error_class"], "KeyError")
        self.assertIsNone(record.exc_info)

    def test_levels_follow_outcome_and_can_be_overridden(self):
        levels = {
            outcome: self._log(None, "login", outcome, level="DEBUG")[1].levelno
            for outcome in ("success", "rejected", "throttled", "error")
        }
        self.assertEqual(
            levels,
            {
                "success": logging.INFO,
                "rejected": logging.INFO,
                "throttled": logging.WARNING,
                "error": logging.ERROR,
            },
        )
        with self.assertLogs("account.auth", level="DEBUG") as captured:
            log_auth_event(None, "login", "success", level=logging.WARNING)
        self.assertEqual(captured.records[0].levelno, logging.WARNING)

    def test_throttled_event_reads_scope_from_the_request(self):
        request = self._request()
        request._throttle_scope = "login_email"
        event, record = self._log(request, "login", "throttled", level="WARNING", status=429)
        self.assertEqual(event["throttle_scope"], "login_email")
        self.assertEqual(record.levelno, logging.WARNING)

    def test_request_none_and_explicit_request_id_override(self):
        event, _ = self._log(None, "resend_verification", "error", request_id="celery-req-0001")
        self.assertEqual(event["request_id"], "celery-req-0001")
        self.assertNotIn("endpoint", event)
        self.assertNotIn("client_ip", event)
        event, _ = self._log(None, "resend_verification", "error", request_id="not valid!")
        self.assertNotIn("request_id", event)

    def test_request_id_and_latency_come_from_the_middleware(self):
        captured = {}

        def view(request):
            with self.assertLogs("account.auth") as cm:
                log_auth_event(request, "login", "success")
            captured["event"] = json.loads(cm.records[0].getMessage())
            return HttpResponse("ok")

        request, _ = _run_middleware(get_response=view)
        self.assertEqual(captured["event"]["request_id"], request.request_id)
        self.assertIsInstance(captured["event"]["latency_ms"], int)
        self.assertGreaterEqual(captured["event"]["latency_ms"], 0)

    def test_never_raises_on_hostile_input(self):
        class Hostile:
            def __getattr__(self, name):
                raise RuntimeError("nope")

        with self.assertLogs("account.auth", level="DEBUG"):
            log_auth_event(SimpleNamespace(META=Hostile(), path=Hostile()), "login", "success")
            log_auth_event(object(), 123, None, status="x", user=object(), email=12345, error=3, level="bad")
            log_auth_event(None, "login", "success", **{"weird key": Hostile(), "n": [Hostile()]})

    def test_internal_failure_logs_one_warning_and_returns(self):
        with patch("account.observability.json.dumps", side_effect=RuntimeError("secret detail")):
            with self.assertLogs("account.observability", level="WARNING") as cm:
                log_auth_event(None, "login", "success")
        self.assertEqual(len(cm.records), 1)
        self.assertIn("RuntimeError", cm.records[0].getMessage())
        self.assertNotIn("secret detail", cm.records[0].getMessage())

    def test_event_logger_is_json_only_and_does_not_propagate(self):
        from django.conf import settings

        cfg = settings.LOGGING["loggers"]["account.auth"]
        self.assertFalse(cfg["propagate"])
        self.assertEqual(cfg["level"], "INFO")
        self.assertIn("auth_events_console", cfg["handlers"])
        self.assertEqual(settings.LOGGING["handlers"]["auth_events_console"]["stream"], "ext://sys.stdout")
        self.assertFalse(logging.getLogger("account.auth").propagate)


class AuthEventFormatterTests(SimpleTestCase):
    def test_message_only_and_traceback_is_scrubbed(self):
        try:
            raise ValueError("duplicate key Key (email)=(victim@example.com) already exists")
        except ValueError:
            exc_info = sys.exc_info()
        record = logging.LogRecord("account.auth", logging.ERROR, __file__, 1, '{"event":"auth"}', None, exc_info)
        rendered = AuthEventFormatter().format(record)
        self.assertTrue(rendered.startswith('{"event":"auth"}'))
        self.assertNotIn("victim@example.com", rendered)
        self.assertIn("ValueError", rendered)


class AuthEmailHashCommandTests(SimpleTestCase):
    def _run(self, *emails):
        out, err = StringIO(), StringIO()
        call_command("auth_email_hash", *emails, stdout=out, stderr=err)
        return out.getvalue(), err.getvalue()

    def test_prints_hash_and_normalised_email_with_a_grep_hint(self):
        out, err = self._run("  Customer@Example.COM ", "other@example.com", "\u200b")
        lines = out.strip().splitlines()
        self.assertEqual(lines[0], f"{hash_email('customer@example.com')}  customer@example.com")
        self.assertEqual(lines[1], f"{hash_email('other@example.com')}  other@example.com")
        self.assertEqual(len(lines), 2)  # the zero-width-only argument was skipped
        self.assertIn("Skipping unusable", err)
        self.assertIn("email_hash", err)  # usage hint

    def test_only_unusable_input_is_an_error(self):
        with self.assertRaises(CommandError):
            self._run("", "   ")
