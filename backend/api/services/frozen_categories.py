"""
Frozen-product detection from CategoryGroup (``FROZEN_CATEGORY_GROUP_ID``, default #2).
"""

from __future__ import annotations

from django.conf import settings

from api.services.category_groups import expand_category_ids_for_product_filter


def frozen_category_group_id() -> int:
    return int(getattr(settings, "FROZEN_CATEGORY_GROUP_ID", 2))


def get_frozen_category_group():
    from api.models import CategoryGroup

    gid = frozen_category_group_id()
    return (
        CategoryGroup.objects.filter(pk=gid)
        .prefetch_related("categories")
        .first()
    )


def get_frozen_category_ids() -> frozenset[int]:
    """Category PKs in the frozen-products group."""
    group = get_frozen_category_group()
    if not group:
        return frozenset()
    direct_ids = list(group.categories.values_list("id", flat=True).distinct())
    direct_ids = [i for i in direct_ids if i is not None]
    return frozenset(expand_category_ids_for_product_filter(direct_ids))


def product_has_frozen_category(product) -> bool:
    """True when the product belongs to the frozen-products category group."""
    if not product:
        return False
    ids = get_frozen_category_ids()
    if not ids:
        return False
    return product.categories.filter(id__in=ids).exists()
