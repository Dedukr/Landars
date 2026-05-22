"""
Denormalised product sales counters — rebuilt from Order / OrderItem truth.

``SOLD_ORDER_STATUSES`` matches the set used for verified-purchase checks on
reviews (``order__status__in=[...]`` in ``ProductReviewSerializer``): paid,
fulfilment, and invoiced states. Pending / cancelled orders never contribute.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Sum

logger = logging.getLogger(__name__)

# Keep in sync with verified-purchase logic in api.serializers.ProductReviewSerializer
SOLD_ORDER_STATUSES: tuple[str, ...] = ("paid", "ready_to_ship", "issued")


def collect_product_ids_for_order(order) -> list[int]:
    """Distinct non-null product PKs on this order (for batch rebuild)."""
    from api.models import OrderItem

    return list(
        OrderItem.objects.filter(order_id=order.pk)
        .exclude(product_id__isnull=True)
        .values_list("product_id", flat=True)
        .distinct()
    )


def rebuild_product_sales_counters(product_ids: Iterable[int]) -> None:
    """
    Set ``sold_quantity`` and ``sold_orders_count`` from live order lines.

    - ``sold_quantity``: sum of ``OrderItem.quantity`` for lines in sold orders.
    - ``sold_orders_count``: distinct sold orders containing the product.

    Idempotent; safe to call after any order/item change affecting totals.
    """
    from api.models import OrderItem, Product

    ids = sorted({int(p) for p in product_ids if p is not None})
    if not ids:
        return

    rows = (
        OrderItem.objects.filter(
            product_id__in=ids,
            order__status__in=SOLD_ORDER_STATUSES,
        )
        .values("product_id")
        .annotate(
            sold_qty=Sum("quantity"),
            sold_oc=Count("order_id", distinct=True),
        )
    )
    agg: dict[int, dict[str, int]] = {}
    for row in rows:
        pid = row["product_id"]
        raw_qty = row["sold_qty"]
        try:
            sq = int(raw_qty) if raw_qty is not None else 0
        except (TypeError, ValueError, InvalidOperation):
            try:
                sq = int(Decimal(str(raw_qty)))
            except (InvalidOperation, TypeError, ValueError):
                sq = 0
        agg[pid] = {
            "sold_quantity": max(0, sq),
            "sold_orders_count": int(row["sold_oc"] or 0),
        }

    with transaction.atomic():
        for pid in ids:
            data = agg.get(
                pid, {"sold_quantity": 0, "sold_orders_count": 0}
            )
            updated = Product.objects.filter(pk=pid).update(
                sold_quantity=data["sold_quantity"],
                sold_orders_count=data["sold_orders_count"],
            )
            if updated == 0 and pid in ids:
                logger.debug(
                    "rebuild_product_sales_counters: product id=%s not found (skipped)",
                    pid,
                )


def rebuild_all_product_sales_counters() -> int:
    """
    Full recompute: zero all products, then aggregate from order lines.

    Ensures products with no remaining sold lines get counters cleared.
    """
    from api.models import OrderItem, Product

    Product.objects.update(sold_quantity=0, sold_orders_count=0)
    pids = list(
        OrderItem.objects.exclude(product_id__isnull=True)
        .values_list("product_id", flat=True)
        .distinct()
    )
    rebuild_product_sales_counters(pids)
    return len(pids)
