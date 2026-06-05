"""
Post-delivery eligibility from CategoryGroup #1 (``POST_DELIVERY_CATEGORY_GROUP_ID``).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

_CACHE_KEY = "post_delivery_category_ids:v2:{group_id}"


def post_delivery_category_group_id() -> int:
    return int(getattr(settings, "POST_DELIVERY_CATEGORY_GROUP_ID", 1))


def get_post_delivery_category_group():
    """Return the CategoryGroup used for post-delivery rules, or None."""
    from api.models import CategoryGroup

    gid = post_delivery_category_group_id()
    return (
        CategoryGroup.objects.filter(pk=gid)
        .prefetch_related("categories")
        .first()
    )


def invalidate_post_delivery_category_cache(group_id: int | None = None) -> None:
    gid = group_id if group_id is not None else post_delivery_category_group_id()
    cache.delete(_CACHE_KEY.format(group_id=gid))


def get_post_delivery_category_ids() -> frozenset[int]:
    """
    Category PKs for the post-delivery group, expanded to descendant subcategories.
    """
    gid = post_delivery_category_group_id()
    cache_key = _CACHE_KEY.format(group_id=gid)
    cached = cache.get(cache_key)
    # Ignore cached empty lists — they often come from an earlier empty group (e.g. after
    # a DB restore) and M2M signals may not have fired when categories were added later.
    if cached:
        return frozenset(cached)

    group = get_post_delivery_category_group()
    if not group:
        return frozenset()

    from api.services.category_groups import expand_category_ids_for_product_filter

    try:
        direct_ids = list(group.categories.values_list("id", flat=True).distinct())
        direct_ids = [i for i in direct_ids if i is not None]
        expanded = expand_category_ids_for_product_filter(direct_ids)
    except Exception:
        logger.exception("Failed to load post-delivery categories for group %s", gid)
        expanded = []

    if expanded:
        cache.set(cache_key, expanded, 3600)
    return frozenset(expanded)


def product_has_post_delivery_category(product) -> bool:
    """True when the product is assigned at least one post-delivery group category."""
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
