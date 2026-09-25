"""Settings hardening: cookie flags, Redis socket timeouts, rates, logging, SECRET_KEY.

``backend/settings.py`` is executed in isolation under a controlled environment
(the test runner forces ``DEBUG=False`` on the live module, so the DEBUG-dependent
flags could not be proven against it). ``.env`` is never read.
"""

import importlib.util
import io
import logging
import logging.handlers
import os
import re
import socket
import tempfile
import time
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core.cache.backends.redis import RedisCache
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from account.observability import AuthEventFormatter, RequestIDLogFilter
from account.throttles import LoginThrottle

SETTINGS_PATH = Path(settings.BASE_DIR) / "backend" / "settings.py"
STRONG_KEY = "unit-test-secret-key-" + "x" * 50


def load_settings(**env):
    """Run settings.py with exactly ``env`` as the environment; return (module, stderr_text)."""
    spec = importlib.util.spec_from_file_location("account_settings_probe", SETTINGS_PATH)
    module = importlib.util.module_from_spec(spec)
    out, err = io.StringIO(), io.StringIO()
    environment = {"DEBUG": "False", "SECRET_KEY": STRONG_KEY, **env}
    with patch.dict(os.environ, environment, clear=True), patch("dotenv.load_dotenv"):
        with redirect_stdout(out), redirect_stderr(err):
            spec.loader.exec_module(module)
    return module, err.getvalue()


def build_cache(cfg):
    params = {k: v for k, v in cfg.items() if k not in ("BACKEND", "LOCATION")}
    return RedisCache(cfg["LOCATION"], params)


class CookieAndMiddlewareSettingsTests(SimpleTestCase):
    def test_cookies_are_secure_outside_debug(self):
        prod, _ = load_settings(DEBUG="False")
        self.assertIs(prod.CSRF_COOKIE_SECURE, True)
        self.assertIs(prod.SESSION_COOKIE_SECURE, True)

    def test_cookies_are_not_secure_in_local_debug(self):
        dev, _ = load_settings(DEBUG="True")
        self.assertIs(dev.CSRF_COOKIE_SECURE, False)
        self.assertIs(dev.SESSION_COOKIE_SECURE, False)

    def test_csrf_cookie_stays_readable_by_the_spa(self):
        for debug in ("True", "False"):
            module, _ = load_settings(DEBUG=debug)
            self.assertIs(module.CSRF_COOKIE_HTTPONLY, False)
            self.assertEqual(module.CSRF_COOKIE_SAMESITE, "Lax")

    def test_request_id_middleware_is_first_and_handler_is_wired(self):
        for module in (load_settings()[0], settings):
            self.assertEqual(module.MIDDLEWARE[0], "account.observability.RequestIDMiddleware")
            self.assertIn("corsheaders.middleware.CorsMiddleware", module.MIDDLEWARE)
            self.assertEqual(
                module.REST_FRAMEWORK["EXCEPTION_HANDLER"], "account.api_errors.exception_handler"
            )

    def test_request_id_and_retry_after_are_exposed_to_cross_origin_callers(self):
        module, _ = load_settings()
        for header in ("X-Request-ID", "Retry-After", "Content-Type", "X-CSRFToken", "Authorization"):
            self.assertIn(header, module.CORS_EXPOSE_HEADERS)


class RateSettingsTests(SimpleTestCase):
    NAMES = {
        "REGISTER_RATE_LIMIT": "300/hour",
        "REGISTER_EMAIL_RATE_LIMIT": "8/hour",
        "LOGIN_RATE_LIMIT": "20/minute",
        "LOGIN_EMAIL_RATE_LIMIT": "8/minute",
        "PASSWORD_RESET_RATE_LIMIT": "100/hour",
        "PASSWORD_RESET_EMAIL_RATE_LIMIT": "8/hour",
        "EMAIL_VERIFICATION_RATE_LIMIT": "1000/hour",
        "EMAIL_VERIFICATION_RESEND_RATE_LIMIT": "12/hour",
        "EMAIL_VERIFICATION_RESEND_IP_RATE_LIMIT": "300/hour",
        "CLIENT_EVENT_RATE_LIMIT": "60/minute",
    }

    def test_defaults(self):
        module, _ = load_settings()
        for name, default in self.NAMES.items():
            self.assertEqual(getattr(module, name), default, name)

    def test_env_overrides(self):
        module, _ = load_settings(**{name: "3/day" for name in self.NAMES})
        for name in self.NAMES:
            self.assertEqual(getattr(module, name), "3/day", name)

    def test_each_rate_setting_is_defined_exactly_once(self):
        source = SETTINGS_PATH.read_text()
        for name in self.NAMES:
            self.assertEqual(len(re.findall(rf"^{name}\s*=", source, re.M)), 1, name)

    def test_live_settings_match_the_throttle_defaults(self):
        self.assertEqual((LoginThrottle().num_requests, LoginThrottle().duration), (20, 60))

    def test_password_reset_timeout_and_refresh_grace(self):
        default, _ = load_settings()
        self.assertEqual(default.PASSWORD_RESET_TIMEOUT, 3600)  # the reset email promises 1 hour
        self.assertEqual(default.JWT_REFRESH_ROTATION_GRACE_SECONDS, 30)
        custom, _ = load_settings(PASSWORD_RESET_TIMEOUT="1800", JWT_REFRESH_ROTATION_GRACE_SECONDS="0")
        self.assertEqual(custom.PASSWORD_RESET_TIMEOUT, 1800)
        self.assertEqual(custom.JWT_REFRESH_ROTATION_GRACE_SECONDS, 0)


class RedisCacheOptionsTests(SimpleTestCase):
    URL = "redis://:pw@127.0.0.1:6399/1"

    def test_no_redis_url_leaves_the_default_cache_untouched(self):
        module, _ = load_settings()
        self.assertFalse(hasattr(module, "CACHES"))

    def test_options_default_to_two_second_socket_timeouts(self):
        module, _ = load_settings(DJANGO_CACHE_REDIS_URL=self.URL)
        cfg = module.CACHES["default"]
        self.assertEqual(cfg["BACKEND"], "django.core.cache.backends.redis.RedisCache")
        self.assertEqual(cfg["LOCATION"], self.URL)
        self.assertEqual(cfg["OPTIONS"], {"socket_connect_timeout": 2.0, "socket_timeout": 2.0})

    def test_timeouts_are_env_overridable(self):
        module, _ = load_settings(
            DJANGO_CACHE_REDIS_URL=self.URL,
            DJANGO_CACHE_SOCKET_CONNECT_TIMEOUT="0.5",
            DJANGO_CACHE_SOCKET_TIMEOUT="1.5",
        )
        self.assertEqual(module.CACHES["default"]["OPTIONS"], {"socket_connect_timeout": 0.5, "socket_timeout": 1.5})

    def test_django_hands_the_options_to_the_redis_connection_pool(self):
        """Django 5.2 passes CACHES OPTIONS to redis-py's ConnectionPool.from_url as kwargs."""
        module, _ = load_settings(DJANGO_CACHE_REDIS_URL=self.URL)
        client = build_cache(module.CACHES["default"])._cache
        self.assertEqual(client._pool_options["socket_timeout"], 2.0)
        self.assertEqual(client._pool_options["socket_connect_timeout"], 2.0)
        pool = client._get_connection_pool(write=True)  # builds the pool; no connection is made
        self.assertEqual(pool.connection_kwargs["socket_timeout"], 2.0)
        self.assertEqual(pool.connection_kwargs["socket_connect_timeout"], 2.0)
        self.assertEqual(pool.connection_kwargs["host"], "127.0.0.1")
        self.assertEqual(pool.connection_kwargs["password"], "pw")

    def test_a_stalled_redis_times_out_instead_of_hanging_and_the_throttle_fails_open(self):
        try:
            blackhole = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            blackhole.bind(("127.0.0.1", 0))
            blackhole.listen(5)  # accepts TCP connections (kernel backlog) but never speaks
        except OSError as exc:
            self.skipTest(f"cannot open a local socket here: {exc}")
        self.addCleanup(blackhole.close)
        url = f"redis://127.0.0.1:{blackhole.getsockname()[1]}/0"
        module, _ = load_settings(
            DJANGO_CACHE_REDIS_URL=url,
            DJANGO_CACHE_SOCKET_CONNECT_TIMEOUT="0.3",
            DJANGO_CACHE_SOCKET_TIMEOUT="0.3",
        )
        stalled = build_cache(module.CACHES["default"])

        started = time.monotonic()
        with self.assertRaises(Exception) as caught:
            stalled.get("throttle_login_203.0.113.9")
        self.assertLess(time.monotonic() - started, 8.0)  # 2 s socket timeout; slack for a loaded CI box
        self.assertIn(type(caught.exception).__module__.split(".")[0], {"redis", "builtins"})

        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        request = Request(APIRequestFactory().post("/api/auth/login/", {}, format="json"))
        started = time.monotonic()
        with patch.object(LoginThrottle, "cache", stalled), self.assertLogs("account.throttles", level="WARNING"):
            allowed = LoginThrottle().allow_request(request, None)
        self.assertTrue(allowed)
        self.assertLess(time.monotonic() - started, 8.0)  # 2 s socket timeout; slack for a loaded CI box


class LoggingSettingsTests(SimpleTestCase):
    def test_text_format_has_timestamp_level_logger_and_request_id(self):
        cfg = load_settings()[0].LOGGING
        simple = cfg["formatters"]["simple"]
        self.assertEqual(simple["format"], "{asctime} {levelname} {name} rid={request_id} {message}")
        self.assertEqual(simple["style"], "{")
        self.assertIn("%z", simple["datefmt"])  # UTC offset: TIME_ZONE is Europe/London

    def test_request_id_filter_is_attached_to_every_console_handler(self):
        cfg = load_settings()[0].LOGGING
        self.assertEqual(cfg["filters"]["request_id"]["()"], "account.observability.RequestIDLogFilter")
        for name in ("console", "console_django_request"):
            self.assertIn("request_id", cfg["handlers"][name]["filters"])
        self.assertIn("suppress_cloudprnt_auth_challenge", cfg["handlers"]["console_django_request"]["filters"])
        self.assertEqual(cfg["root"]["handlers"], ["console"])

    def test_existing_logger_entries_are_kept(self):
        loggers = load_settings()[0].LOGGING["loggers"]
        for name in ("fontTools", "fontTools.subset", "weasyprint", "celery.app.trace",
                     "celery.worker.strategy", "django.security.DisallowedHost", "django.request"):  # fmt: skip
            self.assertIn(name, loggers)
        self.assertEqual(loggers["django.request"]["handlers"], ["console_django_request"])

    def test_auth_events_use_a_separate_stdout_handler_without_propagation(self):
        cfg = load_settings()[0].LOGGING
        auth = cfg["loggers"]["account.auth"]
        self.assertEqual(auth["level"], "INFO")
        self.assertIs(auth["propagate"], False)
        self.assertEqual(auth["handlers"], ["auth_events_console"])
        handler = cfg["handlers"]["auth_events_console"]
        self.assertEqual(handler["stream"], "ext://sys.stdout")
        self.assertEqual(cfg["formatters"][handler["formatter"]]["()"], "account.observability.AuthEventFormatter")
        self.assertNotIn("auth_events_file", cfg["handlers"])

    def test_live_logging_configuration_was_applied(self):
        auth = logging.getLogger("account.auth")
        self.assertFalse(auth.propagate)
        self.assertEqual(auth.level, logging.INFO)
        self.assertTrue(any(isinstance(h.formatter, AuthEventFormatter) for h in auth.handlers))
        console = [h for h in logging.getLogger().handlers if isinstance(h, logging.StreamHandler)]
        self.assertTrue(any(any(isinstance(f, RequestIDLogFilter) for f in h.filters) for h in console))

    def test_optional_rotating_file_handler_is_enabled_only_by_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = os.path.join(tmp, "nested", "auth_events.log")
            module, stderr = load_settings(AUTH_EVENT_LOG_FILE=target)
            cfg = module.LOGGING
            handler = cfg["handlers"]["auth_events_file"]
            self.assertEqual(handler["class"], "logging.handlers.RotatingFileHandler")
            self.assertEqual(handler["filename"], target)
            self.assertEqual((handler["maxBytes"], handler["backupCount"]), (10 * 1024 * 1024, 10))
            self.assertIs(handler["delay"], True)
            self.assertEqual(cfg["loggers"]["account.auth"]["handlers"], ["auth_events_console", "auth_events_file"])
            self.assertTrue(os.path.isdir(os.path.dirname(target)))
            self.assertEqual(stderr, "")

            # The configuration really works: build the handler and write one event line.
            real = logging.handlers.RotatingFileHandler(
                handler["filename"], maxBytes=handler["maxBytes"], backupCount=handler["backupCount"],
                encoding=handler["encoding"], delay=handler["delay"],
            )  # fmt: skip
            real.setFormatter(AuthEventFormatter())
            self.addCleanup(real.close)
            real.handle(logging.LogRecord("account.auth", logging.INFO, __file__, 1, '{"event":"auth"}', None, None))
            real.flush()
            self.assertEqual(Path(target).read_text(), '{"event":"auth"}\n')

    def test_empty_env_means_no_file_handler(self):
        cfg = load_settings(AUTH_EVENT_LOG_FILE="   ")[0].LOGGING
        self.assertNotIn("auth_events_file", cfg["handlers"])

    def test_unusable_log_path_is_skipped_with_a_warning_and_never_fatal(self):
        with tempfile.NamedTemporaryFile() as blocker:
            module, stderr = load_settings(AUTH_EVENT_LOG_FILE=os.path.join(blocker.name, "sub", "auth.log"))
        self.assertIn("AUTH_EVENT_LOG_FILE ignored", stderr)
        self.assertNotIn("auth_events_file", module.LOGGING["handlers"])
        self.assertEqual(module.LOGGING["loggers"]["account.auth"]["handlers"], ["auth_events_console"])


class SecretKeyRefuseTests(SimpleTestCase):
    def _load_with_fallback_key(self, debug):
        """Env without SECRET_KEY so settings falls back to its built-in default."""
        spec = importlib.util.spec_from_file_location("account_settings_probe_key", SETTINGS_PATH)
        module = importlib.util.module_from_spec(spec)
        err = io.StringIO()
        with patch.dict(os.environ, {"DEBUG": debug}, clear=True), patch("dotenv.load_dotenv"):
            with redirect_stdout(io.StringIO()), redirect_stderr(err):
                spec.loader.exec_module(module)
        return module, err.getvalue()

    def test_built_in_fallback_key_in_production_refuses_to_boot(self):
        with self.assertRaises(ImproperlyConfigured) as caught:
            self._load_with_fallback_key("False")
        self.assertIn("SECRET_KEY", str(caught.exception))
        self.assertNotIn("django-insecure-", str(caught.exception))

    def test_no_warning_in_debug(self):
        _, stderr = self._load_with_fallback_key("True")
        self.assertNotIn("SECRET_KEY", stderr)

    def test_placeholder_keys_from_env_example_also_refuse(self):
        for placeholder in ("change-me-generate-a-long-random-string", "django-insecure-abc"):
            with self.subTest(placeholder=placeholder):
                with self.assertRaises(ImproperlyConfigured) as caught:
                    load_settings(DEBUG="False", SECRET_KEY=placeholder)
                self.assertIn("SECRET_KEY", str(caught.exception))
                self.assertNotIn(placeholder, str(caught.exception))

    def test_a_real_key_is_silent(self):
        module, stderr = load_settings(DEBUG="False", SECRET_KEY=STRONG_KEY)
        self.assertEqual(module.SECRET_KEY, STRONG_KEY)
        self.assertNotIn("SECRET_KEY", stderr)


class CeleryAuthQueueTests(SimpleTestCase):
    def test_email_tasks_route_to_the_email_queue(self):
        module, _ = load_settings()
        self.assertEqual(module.CELERY_TASK_DEFAULT_QUEUE, "celery")
        for name in (
            "account.tasks.send_verification_email_task",
            "account.tasks.send_verification_confirmation_email_task",
            "account.tasks.send_password_reset_email_task",
            "account.tasks.send_password_reset_confirmation_email_task",
        ):
            self.assertEqual(module.CELERY_TASK_ROUTES[name], {"queue": "email"})

    def test_beat_schedules_token_cleanup_and_unsent_mail_alert(self):
        module, _ = load_settings()
        self.assertEqual(
            module.CELERY_BEAT_SCHEDULE["auth-cleanup-expired-tokens"]["task"],
            "account.tasks.cleanup_expired_auth_tokens_task",
        )
        self.assertEqual(
            module.CELERY_BEAT_SCHEDULE["auth-alert-unsent-verification-emails"]["task"],
            "account.tasks.alert_unsent_verification_emails_task",
        )
        self.assertEqual(
            module.CELERY_BEAT_SCHEDULE["auth-alert-email-queue-backlog"]["task"],
            "account.tasks.alert_email_queue_backlog_task",
        )
        self.assertEqual(module.CELERY_WORKER_PREFETCH_MULTIPLIER, 1)
        self.assertIsNone(module.AWS_SES_AUTO_THROTTLE)
        self.assertEqual(module.EMAIL_QUEUE_NAME, "email")
        self.assertEqual(module.EMAIL_QUEUE_BACKLOG_ALERT, 100)

    def test_email_timeout_is_an_int_when_set_and_ses_throttle_can_be_reenabled(self):
        module, _ = load_settings(EMAIL_TIMEOUT="30", AWS_SES_AUTO_THROTTLE="0.5")
        self.assertEqual(module.EMAIL_TIMEOUT, 30)
        self.assertEqual(module.AWS_SES_AUTO_THROTTLE, 0.5)
        off, _ = load_settings(AWS_SES_AUTO_THROTTLE="none", EMAIL_USE_LOCALTIME="False")
        self.assertIsNone(off.AWS_SES_AUTO_THROTTLE)
        self.assertIs(off.EMAIL_USE_LOCALTIME, False)
        local, _ = load_settings(EMAIL_USE_LOCALTIME="True")
        self.assertIs(local.EMAIL_USE_LOCALTIME, True)
