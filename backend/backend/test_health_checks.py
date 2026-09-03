from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase, override_settings

from backend.health_checks import check_redis, comprehensive_health_check
from django.test import RequestFactory


class RedisHealthCheckTests(TestCase):
    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.redis.RedisCache",
                "LOCATION": "redis://localhost:6379/1",
            }
        }
    )
    @patch("backend.health_checks.cache.set", side_effect=ConnectionError("redis down"))
    def test_redis_failure_reports_degraded(self, _mock_set):
        ok, message = check_redis()
        self.assertFalse(ok)
        self.assertIn("Cache unavailable", message)

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.redis.RedisCache",
                "LOCATION": "redis://localhost:6379/1",
            }
        }
    )
    @patch("backend.health_checks.check_database", return_value=(True, "ok"))
    @patch("backend.health_checks.check_redis", return_value=(False, "Cache unavailable"))
    @patch("backend.health_checks.check_disk_space", return_value=(True, "ok"))
    @patch("backend.health_checks.check_memory", return_value=(True, "ok"))
    @patch("backend.health_checks.check_festival_optional", return_value=(True, "ok"))
    def test_comprehensive_health_returns_503_when_cache_down(
        self, *_mocks
    ):
        request = RequestFactory().get("/health/")
        response = comprehensive_health_check(request)
        self.assertEqual(response.status_code, 503)
        import json

        payload = json.loads(response.content)
        self.assertEqual(payload["status"], "degraded")
        self.assertEqual(payload["checks"]["cache"]["status"], "degraded")
