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
    Expand selected category ids to include all descendant subcategories.

    Products are usually tagged with leaf categories; filtering by a parent id alone
    would otherwise return no rows.
    """
    from api.models import ProductCategory

    ids: set[int] = {int(i) for i in category_ids if i is not None}
    if not ids:
        return []

    frontier = list(ids)
    while frontier:
        child_ids = list(
            ProductCategory.objects.filter(parent_id__in=frontier).values_list(
                "id", flat=True
            )
        )
        new = [cid for cid in child_ids if cid is not None and cid not in ids]
        if not new:
            break
        ids.update(new)
        frontier = new

    return sorted(ids)
