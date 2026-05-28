"""
Post-delivery eligibility from a :class:`~api.models.CategoryGroup` (default group id 1).

Replaces the legacy single ``POST_SUITABLE_CATEGORY_ID`` parent category check.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

_CACHE_KEY = "post_delivery_category_ids:v1:{group_id}"


def post_delivery_category_group_id() -> int:
    return int(getattr(settings, "POST_DELIVERY_CATEGORY_GROUP_ID", 1))


def invalidate_post_delivery_category_cache(group_id: int | None = None) -> None:
    gid = group_id if group_id is not None else post_delivery_category_group_id()
    cache.delete(_CACHE_KEY.format(group_id=gid))


def get_post_delivery_category_ids() -> frozenset[int]:
    """
    Category PKs in the configured post-delivery group (empty if group missing).
    """
    gid = post_delivery_category_group_id()
    cache_key = _CACHE_KEY.format(group_id=gid)
    cached = cache.get(cache_key)
    if cached is not None:
        return frozenset(cached)

    from api.models import CategoryGroup

    try:
        ids = list(
            CategoryGroup.objects.filter(pk=gid)
            .values_list("categories__id", flat=True)
            .distinct()
        )
        ids = [i for i in ids if i is not None]
    except Exception:
        logger.exception("Failed to load post-delivery categories for group %s", gid)
        ids = []

    cache.set(cache_key, ids, 3600)
    return frozenset(ids)


def product_has_post_delivery_category(product) -> bool:
    """True when the product is assigned at least one category from the post-delivery group."""
    if not product:
        return False
    ids = get_post_delivery_category_ids()
    if not ids:
        return False
    return product.categories.filter(id__in=ids).exists()


def all_products_have_post_delivery_category(products: Iterable) -> bool:
    """
    True when every non-null product in ``products`` has a post-delivery group category.

    Empty iterables return False (same as legacy “no items → home delivery” paths).
    """
    products = [p for p in products if p]
    if not products:
        return False
    return all(product_has_post_delivery_category(p) for p in products)
