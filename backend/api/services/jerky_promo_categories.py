"""
Jerky 5+1 eligibility from the leaf :class:`~api.models.ProductCategory` named Jerky.

The category is identified by ``settings.JERKY_PROMO_CATEGORY_ID`` when set (>0),
otherwise by exact name ``settings.JERKY_PROMO_CATEGORY_NAME`` (default ``"Jerky"``).

A product is eligible when it is active and tagged with that leaf category via
``Product.categories``. This is *not* CategoryGroup membership — Meat Snacks (or
any group that also holds basturma/balyk/…) is intentionally not used.
"""

from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def jerky_promo_category_id() -> int:
    """Configured category PK, or ``0`` when name lookup should be used."""
    return int(getattr(settings, "JERKY_PROMO_CATEGORY_ID", 0) or 0)


def jerky_promo_category_name() -> str:
    return str(
        getattr(settings, "JERKY_PROMO_CATEGORY_NAME", "Jerky") or "Jerky"
    ).strip()


def get_jerky_promo_category():
    """Return the leaf ProductCategory used for Jerky 5+1, or None if missing."""
    from api.models import ProductCategory

    cid = jerky_promo_category_id()
    if cid:
        return ProductCategory.objects.filter(pk=cid).first()

    name = jerky_promo_category_name()
    if not name:
        return None
    matches = list(
        ProductCategory.objects.filter(name__iexact=name).order_by("id")
    )
    if not matches:
        return None
    if len(matches) > 1:
        logger.warning(
            "Multiple ProductCategory rows named %r (ids=%s); using id=%s. "
            "Set JERKY_PROMO_CATEGORY_ID to pin one.",
            name,
            [c.id for c in matches],
            matches[0].id,
        )
    return matches[0]


def get_jerky_promo_category_ids() -> frozenset[int]:
    """PKs of the Jerky promo leaf category (empty when missing)."""
    category = get_jerky_promo_category()
    if not category:
        return frozenset()
    return frozenset({category.id})


def product_has_jerky_promo_category(product) -> bool:
    """
    True when ``product`` is tagged with the Jerky leaf ProductCategory.

    Uses the prefetched ``categories`` cache when present (cart / checkout paths)
    to avoid an N+1 ``EXISTS`` query per line.
    """
    if not product:
        return False
    ids = get_jerky_promo_category_ids()
    if not ids:
        return False

    prefetched = getattr(product, "_prefetched_objects_cache", None)
    if prefetched is not None and "categories" in prefetched:
        return any(getattr(cat, "id", None) in ids for cat in product.categories.all())

    categories = getattr(product, "categories", None)
    if categories is None:
        return False
    # Stub / duck-typed managers used in unit tests also expose ``filter().exists()``.
    return categories.filter(id__in=ids).exists()
