"""
Denormalised product sales counters — rebuilt from Order / OrderItem truth.

``SOLD_ORDER_STATUSES`` matches the set used for verified-purchase checks on
reviews (``order__status__in=[...]`` in ``ProductReviewSerializer``): paid,
fulfilment, and invoiced states. Pending / cancelled orders never contribute.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Sum

logger = logging.getLogger(__name__)

# Keep in sync with verified-purchase logic in api.serializers.ProductReviewSerializer
SOLD_ORDER_STATUSES: tuple[str, ...] = ("paid", "ready_to_ship", "issued")

_pending_local = threading.local()


def _pending_state():
    if not hasattr(_pending_local, "product_ids"):
        _pending_local.product_ids: set[int] = set()
        _pending_local.flush_scheduled = False
    return _pending_local


def schedule_product_sales_rebuild(product_ids: Iterable[int]) -> None:
    """
    Queue products for a single aggregate rebuild after the current DB transaction commits.

    Multiple saves in the same request/transaction coalesce into one ``rebuild`` call.
    """
    state = _pending_state()
    added = False
    for pid in product_ids:
        if pid is not None:
            state.product_ids.add(int(pid))
            added = True
    if not added:
        return
    if not state.flush_scheduled:
        state.flush_scheduled = True
        transaction.on_commit(_flush_scheduled_product_sales_rebuild)


def _flush_scheduled_product_sales_rebuild() -> None:
    state = _pending_state()
    ids = list(state.product_ids)
    state.product_ids.clear()
    state.flush_scheduled = False
    if ids:
        rebuild_product_sales_counters(ids)


def product_ids_for_orders(order_ids: Iterable[int]) -> list[int]:
    """Distinct product PKs on the given orders (non-null FK only)."""
    from api.models import OrderItem

    ids = [int(oid) for oid in order_ids if oid is not None]
    if not ids:
        return []
    return list(
        OrderItem.objects.filter(order_id__in=ids)
        .exclude(product_id__isnull=True)
        .values_list("product_id", flat=True)
        .distinct()
    )


def schedule_product_sales_rebuild_for_orders(order_ids: Iterable[int]) -> None:
    """Queue rebuild for every product line on these orders (admin bulk status, etc.)."""
    schedule_product_sales_rebuild(product_ids_for_orders(order_ids))


def collect_product_ids_for_order(order) -> list[int]:
    """Distinct non-null product PKs on this order (for batch rebuild)."""
    if not order.pk:
        return []
    return product_ids_for_orders([order.pk])


def rebuild_product_sales_counters(product_ids: Iterable[int]) -> None:
    """
    Set ``sold_quantity`` and ``sold_orders_count`` from live order lines.

    - ``sold_quantity``: sum of ``OrderItem.quantity`` for lines in sold orders.
    - ``sold_orders_count``: distinct sold orders containing the product.

    Idempotent; safe to call after any order/item change affecting totals.
    Prefer :func:`schedule_product_sales_rebuild` from signal handlers.
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


def set_order_status(order, status: str, **extra_fields) -> None:
    """
    Persist one order's status via ``save()`` (signals + on-commit counter batching).

    Pass additional model fields as keywords, e.g.
    ``set_order_status(order, "paid", payment_status="succeeded")``.
    """
    order.status = status
    update_fields = ["status"]
    for name, value in extra_fields.items():
        setattr(order, name, value)
        update_fields.append(name)
    order.save(update_fields=update_fields)


def bulk_set_order_status(queryset, status: str) -> int:
    """
    Bulk ``Order`` status update. Prefer this over raw ``queryset.update(status=...)``.

    ``OrderQuerySet.update`` schedules product sales counter rebuilds when ``status`` changes.
    """
    return queryset.update(status=status)


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
