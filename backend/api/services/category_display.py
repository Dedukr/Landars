"""
Category carousel metadata: product counts and top-seller primary images.
"""

from __future__ import annotations

from django.db.models import Count

from api.models import Product, ProductCategory, ProductImage


def products_count_by_category_id(category_ids: list[int]) -> dict[int, int]:
    if not category_ids:
        return {}
    rows = (
        ProductCategory.objects.filter(id__in=category_ids)
        .annotate(products_count=Count("products", distinct=True))
        .values("id", "products_count")
    )
    return {row["id"]: row["products_count"] for row in rows}


def top_seller_by_category_id(
    category_ids: list[int],
) -> dict[int, tuple[int, int, int]]:
    """
    For each category, return (product_id, sold_quantity, sold_orders_count)
    for the best-selling product in that category.
    """
    if not category_ids:
        return {}

    best: dict[int, tuple[int, int, int]] = {}

    rows = (
        Product.objects.filter(categories__id__in=category_ids, active=True)
        .values("id", "sold_quantity", "sold_orders_count", "categories__id")
        .order_by("categories__id", "-sold_quantity", "-sold_orders_count", "id")
    )

    for row in rows:
        cat_id = row["categories__id"]
        if cat_id is None or cat_id in best:
            continue
        best[cat_id] = (
            row["id"],
            int(row["sold_quantity"] or 0),
            int(row["sold_orders_count"] or 0),
        )

    return best


def _primary_image_by_product_id(product_ids: list[int]) -> dict[int, str | None]:
    if not product_ids:
        return {}

    images = (
        ProductImage.objects.filter(product_id__in=product_ids)
        .order_by("product_id", "sort_order", "created_at")
        .values("product_id", "image_url")
    )

    primary: dict[int, str | None] = {}
    for row in images:
        pid = row["product_id"]
        if pid not in primary:
            primary[pid] = row["image_url"]
    return primary


def category_display_context(category_ids: list[int]) -> dict[str, dict[int, object]]:
    """
    Build serializer context: products_count and top-seller image per category.
    """
    counts = products_count_by_category_id(category_ids)
    top_sellers = top_seller_by_category_id(category_ids)
    product_ids = [pid for pid, _, _ in top_sellers.values()]
    images = _primary_image_by_product_id(product_ids)

    top_seller_image: dict[int, str | None] = {}
    top_seller_sold_quantity: dict[int, int] = {}

    for cat_id, (pid, sold_qty, _) in top_sellers.items():
        top_seller_image[cat_id] = images.get(pid)
        top_seller_sold_quantity[cat_id] = sold_qty

    return {
        "products_count": counts,
        "top_seller_image": top_seller_image,
        "top_seller_sold_quantity": top_seller_sold_quantity,
    }
