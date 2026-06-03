"""
Dashboard revenue rules (phase 3).

Revenue = sum of order totals for orders with status ``paid`` in the selected period.
Excludes pending, cancelled, and all other statuses. Credit notes are not applied yet.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from django.db.models import QuerySet
from django.utils import timezone

from api.models import Order

# Confirmed on Order.status CharField choices (api.models.Order).
REVENUE_ORDER_STATUS = "paid"


def paid_orders_in_period(
    date_from: datetime, date_to: datetime,
) -> QuerySet[Order]:
    """
    Paid orders in [date_from, date_to].

    Upper bound uses ``timezone.now()`` at query time so orders created in the
    same request (after ``get_period_range``) are still included. ``date_to`` is
    returned in the API payload as the period snapshot.
    """
    end = timezone.now()
    if date_to > end:
        end = date_to
    return Order.objects.filter(
        status=REVENUE_ORDER_STATUS,
        created_at__gte=date_from,
        created_at__lte=end,
    )


def order_total_amount(order: Order) -> Decimal:
    """Order.total_price is a model property; evaluate safely for aggregation."""
    try:
        return Decimal(str(order.total_price))
    except Exception:
        return Decimal("0")


def sum_paid_order_revenue(date_from: datetime, date_to: datetime) -> Decimal:
    orders = paid_orders_in_period(date_from, date_to).prefetch_related(
        "items",
        "items__product",
    )
    total = Decimal("0")
    for order in orders:
        total += order_total_amount(order)
    return total


def paid_order_daily_stats(
    date_from: datetime, date_to: datetime,
) -> list[tuple[date, Decimal, int]]:
    """
    Return sorted ``(day, revenue, order_count)`` triples for paid orders in
    the period.

    ``Order.total_price`` is a Python property so revenue must be accumulated
    via a Python loop (not a DB ``Sum``). The order count is tracked in the
    same loop to avoid a second query.
    """
    # Each entry: [cumulative_revenue, order_count]
    by_day: dict[date, list] = defaultdict(lambda: [Decimal("0"), 0])
    orders = paid_orders_in_period(date_from, date_to).prefetch_related(
        "items",
        "items__product",
    )
    for order in orders:
        if not order.created_at:
            continue
        day = order.created_at.date()
        by_day[day][0] += order_total_amount(order)
        by_day[day][1] += 1
    return [(d, v[0], v[1]) for d, v in sorted(by_day.items())]
