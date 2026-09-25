"""POST /api/auth/client-event/ - the browser failure beacon."""

import json

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

URL = "/api/auth/client-event/"
VALID = {
    "op": "login",
    "stage": "http",
    "status": 502,
    "error": "Failed to fetch",
    "online": True,
    "request_id": "5f2b9c0e7a1d4c3b8e6f0a1b2c3d4e5f",
    "path": "/api/auth/login/",
}


@override_settings(CLIENT_EVENT_RATE_LIMIT="1000/minute")
class ClientEventEndpointTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)  # the beacon must not need a CSRF token

    def _post(self, payload, **extra):
        return self.client.post(URL, json.dumps(payload), content_type="application/json", **extra)

    def _accepted(self, payload, **extra):
        with self.assertLogs("account.auth", level="INFO") as cm:
            response = self._post(payload, **extra)
        self.assertEqual(response.status_code, 204, response.content)
        self.assertEqual(len(cm.records), 1)
        return json.loads(cm.records[0].getMessage()), response

    def _rejected(self, payload, field, **extra):
        with self.assertLogs("account.auth", level="INFO") as cm:
            response = self._post(payload, **extra)
        self.assertEqual(response.status_code, 400, (payload, response.content))
        body = response.json()
        self.assertEqual(body["code"], "validation_error")
        self.assertEqual(body["field"], field)
        self.assertEqual(body["request_id"], response["X-Request-ID"])
        event = json.loads(cm.records[0].getMessage())
        self.assertEqual((event["op"], event["outcome"], event["status"]), ("client_event", "rejected", 400))
        return event, cm.records[0].getMessage()

    # -- accepted ------------------------------------------------------------------

    def test_valid_event_returns_204_and_logs_one_client_event(self):
        event, response = self._accepted(
            VALID,
            HTTP_X_FORWARDED_FOR="1.1.1.1, 203.0.113.9",
            HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/118.0 Safari/537.36",
        )
        self.assertEqual(response.content, b"")
        self.assertRegex(response["X-Request-ID"], r"^[0-9a-f]{32}$")
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual((event["op"], event["outcome"], event["status"]), ("client_event", "success", 204))
        self.assertEqual(event["endpoint"], URL)
        self.assertEqual(event["request_id"], response["X-Request-ID"])  # the beacon's own id
        self.assertEqual(event["client_op"], "login")
        self.assertEqual(event["client_stage"], "http")
        self.assertEqual(event["client_status"], 502)
        self.assertEqual(event["client_error"], "Failed to fetch")
        self.assertIs(event["client_online"], True)
        self.assertEqual(event["client_request_id"], VALID["request_id"])  # the FAILED request's id
        self.assertEqual(event["client_path"], "/api/auth/login/")
        self.assertEqual(event["client_ip"], "203.0.113.9")
        self.assertEqual(event["ua_family"], "Chrome-Desktop")

    def test_minimal_event_is_enough(self):
        event, _ = self._accepted({"op": "restore", "stage": "restore_transient"})
        self.assertEqual((event["client_op"], event["client_stage"]), ("restore", "restore_transient"))
        for absent in ("client_status", "client_error", "client_online", "client_request_id", "client_path"):
            self.assertNotIn(absent, event)

    def test_all_whitelisted_ops_and_stages_are_accepted(self):
        for op in ("login", "register", "refresh", "verify", "resend", "reset", "restore"):
            self._accepted({"op": op, "stage": "network"})
        for stage in ("network", "timeout", "http", "parse", "csrf", "refresh_rejected",
                      "refresh_transient", "restore_transient"):  # fmt: skip
            self._accepted({"op": "login", "stage": stage})

    def test_text_plain_beacon_bodies_are_accepted(self):
        with self.assertLogs("account.auth", level="INFO"):
            response = self.client.post(URL, json.dumps(VALID), content_type="text/plain;charset=UTF-8")
        self.assertEqual(response.status_code, 204)

    def test_status_bounds_and_null(self):
        for status in (None, 0, 200, 599):
            self._accepted({"op": "login", "stage": "http", "status": status})

    def test_null_optional_fields_and_empty_error_are_accepted(self):
        event, _ = self._accepted(
            {"op": "login", "stage": "http", "status": None, "error": "", "online": None, "request_id": None, "path": None}
        )
        self.assertNotIn("client_error", event)

    def test_unknown_keys_are_ignored_and_never_logged(self):
        payload = {**VALID, "password": "hunter2", "token": "tok-123", "email": "victim@example.com",
                   "refresh": "rrr", "cookie": "sessionid=abc", "extra_field": "surprise-value"}  # fmt: skip
        with self.assertLogs("account.auth", level="INFO") as cm:
            response = self._post(payload)
        self.assertEqual(response.status_code, 204)
        message = cm.records[0].getMessage()
        for leaked in ("hunter2", "tok-123", "victim", "example.com", "rrr", "sessionid", "surprise-value"):
            self.assertNotIn(leaked, message)

    def test_query_string_in_path_is_stripped_so_tokens_never_reach_the_log(self):
        for raw in ("/api/auth/password-reset/validate/?token=SUPERSECRET", "/api/auth/verify-email/#SUPERSECRET"):
            with self.subTest(raw=raw):
                with self.assertLogs("account.auth", level="INFO") as cm:
                    response = self._post({**VALID, "path": raw})
                self.assertEqual(response.status_code, 204)
                self.assertNotIn("SUPERSECRET", cm.records[0].getMessage())
                self.assertRegex(json.loads(cm.records[0].getMessage())["client_path"], r"^/api/auth/[a-z/-]+$")

    def test_no_csrf_and_no_authentication_needed(self):
        response = APIClient(enforce_csrf_checks=True).post(
            URL, json.dumps(VALID), content_type="application/json", HTTP_AUTHORIZATION="Bearer garbage.token.value"
        )
        self.assertEqual(response.status_code, 204)

    # -- rejected ------------------------------------------------------------------

    def test_op_and_stage_outside_the_whitelist_are_rejected(self):
        for op in ("logout", "LOGIN", "", None, 5, ["login"], "login ", "<script>alert(1)</script>"):
            self._rejected({"op": op, "stage": "http"}, "op")
        for stage in ("other", "HTTP", "", None, 5, "http\n"):
            self._rejected({"op": "login", "stage": stage}, "stage")
        self._rejected({"stage": "http"}, "op")
        self._rejected({"op": "login"}, "stage")

    def test_status_must_be_an_int_between_0_and_599_or_null(self):
        for status in (600, -1, "500", 200.5, True, [500], {"a": 1}, 10**12):
            self._rejected({"op": "login", "stage": "http", "status": status}, "status")

    def test_error_charset_and_length(self):
        for error in ("x" * 41, "<script>", "a;b", "TypeError: colon", "line\nbreak", "quote\"", 'x"}{"event":"auth"', 5, ["a"], "é"):
            self._rejected({"op": "login", "stage": "http", "error": error}, "error")
        self._accepted({"op": "login", "stage": "http", "error": "x" * 40})
        self._accepted({"op": "login", "stage": "http", "error": "TypeError Load_failed.-ok"})

    def test_online_must_be_a_boolean(self):
        for online in ("true", 1, 0, "yes", [True]):
            self._rejected({"op": "login", "stage": "http", "online": online}, "online")

    def test_request_id_must_match_the_id_format(self):
        for rid in ("short", "has space in it", "x" * 65, "abcdefgh\n", "bad!id!bad!", 12345678, ["a"]):
            self._rejected({"op": "login", "stage": "http", "request_id": rid}, "request_id")

    def test_path_rules(self):
        bad_paths = ["/api/products/", "api/auth/login/", "/api/auth", "https://evil.example/api/auth/x/",
                     "/api/auth/" + "a" * 80, "/api/auth/../admin/", "/api/auth/login/%0d%0a", "/api/auth/lögin/",
                     "/api/auth/a b/", 5, ["/api/auth/x/"]]  # fmt: skip
        for path in bad_paths:
            self._rejected({"op": "login", "stage": "http", "path": path}, "path")
        self._accepted({"op": "login", "stage": "http", "path": "/api/auth/" + "a" * 70})  # exactly 80

    def test_non_object_bodies_are_rejected_with_the_same_shape(self):
        for raw in ("[]", '"text"', "null", "42", "true", "{not json", "", "\xff\xfe"):
            with self.subTest(raw=raw):
                with self.assertLogs("account.auth", level="INFO"):
                    response = self.client.post(URL, raw, content_type="application/json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["code"], "validation_error")
                self.assertEqual(response.json()["field"], "body")

    def test_rejections_never_echo_or_log_client_strings(self):
        _, message = self._rejected({"op": "<script>alert(1)</script>", "stage": "http"}, "op")
        self.assertNotIn("script", message)
        response = self._post({"op": "<script>alert(2)</script>", "stage": "http"})
        self.assertNotIn(b"script", response.content)

    def test_bodies_over_2kb_get_413_and_are_not_logged(self):
        big = {**VALID, "error": "x", "padding": "y" * 2100}
        raw = json.dumps(big)
        self.assertGreater(len(raw), 2048)
        with self.assertNoLogs("account.auth", level="INFO"):
            response = self.client.post(URL, raw, content_type="application/json")
        self.assertEqual(response.status_code, 413)
        body = response.json()
        self.assertEqual(body["code"], "payload_too_large")
        self.assertEqual(body["request_id"], response["X-Request-ID"])

    def test_body_exactly_at_the_limit_is_still_read(self):
        base = json.dumps({"op": "login", "stage": "http", "pad": ""})
        padded = json.dumps({"op": "login", "stage": "http", "pad": "p" * (2048 - len(base))})
        self.assertEqual(len(padded), 2048)
        with self.assertLogs("account.auth", level="INFO"):
            self.assertEqual(self.client.post(URL, padded, content_type="application/json").status_code, 204)

    def test_only_post_is_allowed(self):
        for method in ("get", "put", "delete"):
            response = getattr(self.client, method)(URL)
            self.assertEqual(response.status_code, 405, method)
            self.assertIn("request_id", response.json())


class ClientEventThrottleTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    @override_settings(CLIENT_EVENT_RATE_LIMIT="2/minute")
    def test_third_event_from_the_same_ip_gets_a_friendly_429(self):
        headers = {"HTTP_X_FORWARDED_FOR": "1.1.1.1, 203.0.113.9"}
        with self.assertLogs("account.auth", level="INFO"):
            for _ in range(2):
                self.assertEqual(
                    self.client.post(URL, json.dumps(VALID), content_type="application/json", **headers).status_code, 204
                )
        with self.assertLogs("account.auth", level="WARNING") as cm:
            response = self.client.post(URL, json.dumps(VALID), content_type="application/json", **headers)
        self.assertEqual(response.status_code, 429)
        body = response.json()
        self.assertEqual(body["code"], "rate_limited")
        self.assertEqual(response["Retry-After"], str(body["retry_after"]))
        event = json.loads(cm.records[0].getMessage())
        self.assertEqual((event["op"], event["outcome"], event["throttle_scope"]), ("client_event", "throttled", "client_event"))
        self.assertNotIn("email_hash", event)
        # another visitor is not affected
        with self.assertLogs("account.auth", level="INFO"):
            other = self.client.post(
                URL, json.dumps(VALID), content_type="application/json", HTTP_X_FORWARDED_FOR="1.1.1.1, 198.51.100.4"
            )
        self.assertEqual(other.status_code, 204)

    def test_default_rate_is_sixty_per_minute(self):
        from account.throttles import ClientEventThrottle

        throttle = ClientEventThrottle()
        self.assertEqual((throttle.num_requests, throttle.duration), (60, 60))
