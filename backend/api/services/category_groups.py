"""
Category group helpers and product-filter category expansion.
"""

from __future__ import annotations

from collections.abc import Iterable


def category_ids_for_group(group_id: int) -> list[int]:
    """All category PKs assigned to a :class:`~api.models.CategoryGroup`."""
    from api.models import CategoryGroup

    if not group_id:
        return []
    group = (
        CategoryGroup.objects.filter(pk=int(group_id))
        .prefetch_related("categories")
        .first()
    )
    if not group:
        return []
    return list(group.categories.values_list("id", flat=True))


def expand_category_ids_for_product_filter(category_ids: Iterable[int]) -> list[int]:
    """
    Normalize a set of selected category ids for product filtering.

    ``ProductCategory`` rows are flat leaves (no parent/child tree), so there is nothing to
    expand — a selected id only ever matches itself. This function is kept (rather than
    inlining ``sorted(set(...))`` at every call site) so callers don't need to know that
    detail, and so a future re-introduction of grouping/expansion only needs to change this
    one place.
    """
    ids: set[int] = {int(i) for i in category_ids if i is not None}
    return sorted(ids)
