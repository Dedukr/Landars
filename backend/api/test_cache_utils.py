from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIRequestFactory

from account.views import RegisterThrottle
from api.cache_utils import (
    bump_products_cache_generation,
    get_products_cache_generation,
    products_list_cache_key,
    stable_query_hash,
)


class StableQueryHashTests(SimpleTestCase):
    def test_same_params_produce_same_hash_across_calls(self):
        params = {"limit": "50", "offset": "0", "sort": "name_asc"}
        first = stable_query_hash(params)
        second = stable_query_hash(params)
        self.assertEqual(first, second)

    def test_different_params_produce_different_hash(self):
        a = stable_query_hash({"limit": "50"})
        b = stable_query_hash({"limit": "100"})
        self.assertNotEqual(a, b)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "products-cache-gen-tests",
        }
    }
)
class ProductsCacheGenerationTests(TestCase):
    def test_bump_increments_generation(self):
        gen1 = get_products_cache_generation()
        bump_products_cache_generation()
        gen2 = get_products_cache_generation()
        self.assertEqual(gen2, gen1 + 1)

    def test_cache_key_includes_generation(self):
        params = {"limit": "50", "offset": "0"}
        key1 = products_list_cache_key(params)
        bump_products_cache_generation()
        key2 = products_list_cache_key(params)
        self.assertNotEqual(key1, key2)


class RegisterThrottleFailOpenTests(SimpleTestCase):
    def test_allows_request_when_cache_raises(self):
        throttle = RegisterThrottle()
        request = APIRequestFactory().post("/api/auth/register/")
        with patch(
            "rest_framework.throttling.AnonRateThrottle.allow_request",
            side_effect=RuntimeError("redis down"),
        ):
            self.assertTrue(throttle.allow_request(request, None))
