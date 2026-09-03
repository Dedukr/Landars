from django.core.cache import cache
from django.test import TestCase, override_settings

from api.cache_utils import (
    bump_products_cache_generation,
    get_products_cache_generation,
    products_list_cache_key,
)
from api.signals import invalidate_product_list_caches


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "products-list-cache-tests",
        }
    }
)
class ProductsListCacheInvalidationTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_invalidate_bumps_generation_and_changes_key(self):
        params = {"limit": "24"}
        gen_before = get_products_cache_generation()
        key_before = products_list_cache_key(params)

        invalidate_product_list_caches()

        self.assertEqual(get_products_cache_generation(), gen_before + 1)
        self.assertNotEqual(key_before, products_list_cache_key(params))

    def test_bump_products_cache_generation_changes_key_prefix(self):
        params = {"limit": "50", "offset": "0"}
        key_before = products_list_cache_key(params)
        bump_products_cache_generation()
        key_after = products_list_cache_key(params)
        self.assertNotEqual(key_before, key_after)
