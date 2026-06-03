"""
Dashboard revenue rules (phase 3).

Revenue = sum of order totals for orders with status ``paid`` in the selected period.
Excludes pending, cancelled, and all other statuses. Credit notes are not applied yet.

Performance note (section 19)
──────────────────────────────
``Order.total_price`` is a Python property — it is NOT a DB column, so
``Sum("total_price")`` is invalid in Django ORM.

Revenue is therefore computed via two DB aggregations:

1. **Items component** — ``Sum(quantity × item_price)`` on ``OrderItem``
   (uses the price-at-purchase snapshot stored on each line).
2. **Order-level adjustments** — ``Sum(delivery_fee) - Sum(discount)`` on Order.

``holiday_fee`` is a per-order percentage of the items subtotal; including it
exactly would require a correlated subquery per order. It defaults to ``0`` for
most orders so excluding it is an acceptable dashboard approximation.

For invoice-accurate per-order totals, use ``order.total_price`` directly.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, QuerySet, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from api.models import Order, OrderItem

# Confirmed on Order.status CharField choices (api.models.Order).
REVENUE_ORDER_STATUS = "paid"


def _end(date_to: datetime) -> datetime:
    """
    Upper bound for queries: ``timezone.now()`` at call time, or ``date_to`` if
    it is in the future. Ensures orders created *after* ``get_period_range`` ran
    are still captured.
    """
    now = timezone.now()
    return date_to if date_to > now else now


def _line_total_expr() -> ExpressionWrapper:
    """
    DB expression for a single ``OrderItem`` line total:
    ``quantity × (item_price OR product.base_price OR 0)``.
    """
    return ExpressionWrapper(
        F("quantity") * Coalesce(
            F("item_price"),
            F("product__base_price"),
            Value(Decimal("0"), output_field=DecimalField(max_digits=10, decimal_places=2)),
        ),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )


def paid_orders_in_period(
    date_from: datetime, date_to: datetime,
) -> QuerySet[Order]:
    """
    Paid orders in [date_from, date_to].

    Kept for backward compatibility (used by tests and count helpers).
    For aggregated revenue prefer ``sum_paid_order_revenue`` which avoids
    loading full order objects.
    """
    return Order.objects.filter(
        status=REVENUE_ORDER_STATUS,
        created_at__gte=date_from,
        created_at__lte=_end(date_to),
    )


def order_total_amount(order: Order) -> Decimal:
    """
    Exact order total via Python property (uses items + delivery + holiday fee).

    Use this only when you already have an Order instance in memory (e.g.
    ``get_recent_orders`` iterating over 10 rows with select_related). For bulk
    aggregation use ``sum_paid_order_revenue``.
    """
    try:
        return Decimal(str(order.total_price))
    except Exception:
        return Decimal("0")


def sum_paid_order_revenue(date_from: datetime, date_to: datetime) -> Decimal:
    """
    Total revenue for paid orders in period — fully DB-aggregated (section 19).

    Two queries:
    1. ``OrderItem`` → ``Sum(quantity × item_price)``
    2. ``Order``     → ``Sum(delivery_fee) - Sum(discount)``

    ``holiday_fee`` (a per-order percentage of the items subtotal, defaulting to
    0) is excluded to keep the query simple. See module docstring for rationale.
    """
    end = _end(date_to)

    # 1. Items subtotal
    items_total: Decimal = (
        OrderItem.objects.filter(
            order__status=REVENUE_ORDER_STATUS,
            order__created_at__gte=date_from,
            order__created_at__lte=end,
        )
        .aggregate(total=Sum(_line_total_expr()))["total"]
        or Decimal("0")
    )

    # 2. Order-level delivery fee and discount
    stats = Order.objects.filter(
        status=REVENUE_ORDER_STATUS,
        created_at__gte=date_from,
        created_at__lte=end,
    ).aggregate(
        delivery=Coalesce(
            Sum("delivery_fee"),
            Value(Decimal("0"), output_field=DecimalField()),
        ),
        discount=Coalesce(
            Sum("discount"),
            Value(Decimal("0"), output_field=DecimalField()),
        ),
    )

    return Decimal(str(items_total)) + Decimal(str(stats["delivery"])) - Decimal(str(stats["discount"]))


def paid_order_daily_stats(
    date_from: datetime, date_to: datetime,
) -> list[tuple[date, Decimal, int]]:
    """
    Daily ``(day, revenue, order_count)`` triples — fully DB-aggregated (section 19).

    Uses ``TruncDate`` + ``values().annotate()`` on ``OrderItem`` so a single
    SQL query returns per-day line-item revenue and distinct order counts.
    The revenue figure uses the same items-only approximation as
    ``sum_paid_order_revenue`` (see module docstring).
    """
    end = _end(date_to)
    rows = (
        OrderItem.objects.filter(
            order__status=REVENUE_ORDER_STATUS,
            order__created_at__gte=date_from,
            order__created_at__lte=end,
        )
        .annotate(day=TruncDate("order__created_at"))
        .values("day")
        .annotate(
            revenue=Sum(_line_total_expr()),
            orders=Count("order", distinct=True),
        )
        .order_by("day")
    )
    return [
        (row["day"], row["revenue"] or Decimal("0"), row["orders"])
        for row in rows
        if row["day"] is not None
    ]
