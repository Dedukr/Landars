from django.core.cache import cache
from django.test import TestCase, override_settings

from api.signals import bump_products_list_cache_version
from api.views import (
    DEFAULT_PRODUCTS_LIST_CACHE_VERSION,
    PRODUCTS_LIST_CACHE_VERSION_KEY,
    _products_list_cache_key,
)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }
)
class ProductsListCacheVersionTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_bump_increments_version_and_changes_key_prefix(self):
        cache.set(PRODUCTS_LIST_CACHE_VERSION_KEY, 12)
        key_before = _products_list_cache_key({"limit": "24"})
        bump_products_list_cache_version()
        key_after = _products_list_cache_key({"limit": "24"})

        self.assertEqual(cache.get(PRODUCTS_LIST_CACHE_VERSION_KEY), 13)
        self.assertNotEqual(key_before, key_after)
        self.assertTrue(key_before.startswith("products_v12_"))
        self.assertTrue(key_after.startswith("products_v13_"))

    def test_bump_initializes_version_when_missing(self):
        bump_products_list_cache_version()
        self.assertEqual(
            cache.get(PRODUCTS_LIST_CACHE_VERSION_KEY),
            DEFAULT_PRODUCTS_LIST_CACHE_VERSION + 1,
        )
