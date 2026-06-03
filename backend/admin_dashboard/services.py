from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from admin_dashboard.periods import get_period_range, normalize_period
from admin_dashboard.revenue import (
    REVENUE_ORDER_STATUS,
    order_total_amount,
    paid_order_daily_stats,
    paid_orders_in_period,
    sum_paid_order_revenue,
)

ORDER_STATUS_CHOICES = [choice[0] for choice in Order._meta.get_field("status").choices]
COMPLETED_ORDER_STATUSES = ("delivered",)


def _decimal_str(value: Decimal | int | float | None) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(str(value)).quantize(Decimal('0.01'))}"


def _safe_count(qs) -> int:
    try:
        return qs.count()
    except Exception:
        return 0


def _orders_between(date_from: datetime, date_to: datetime):
    end = timezone.now()
    if date_to > end:
        end = date_to
    return Order.objects.filter(
        created_at__gte=date_from,
        created_at__lte=end,
    )


def _today_start() -> datetime:
    """Midnight of today in the active timezone, as an aware datetime."""
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def _month_start() -> datetime:
    """First second of the current calendar month (local tz)."""
    return timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ---------------------------------------------------------------------------
# KPI helpers — each returns a plain Python value safe to serialise.
# ---------------------------------------------------------------------------

def _get_today_revenue() -> str:
    """
    6.1  Today revenue — sum of total_price for paid orders created today.

    ``Order.total_price`` is a Python property (not a DB column) so we use the
    same prefetch-and-iterate pattern as ``sum_paid_order_revenue``.
    """
    start = _today_start()
    orders = (
        Order.objects.filter(status=REVENUE_ORDER_STATUS, created_at__gte=start)
        .prefetch_related("items", "items__product")
    )
    total = Decimal("0")
    for order in orders:
        total += order_total_amount(order)
    return _decimal_str(total)


def _get_today_orders() -> int:
    """
    6.2  Today orders — all orders created today.

    The Order model has no draft/cart status so no exclusion is needed.
    Count covers all real orders regardless of status (pending, paid, issued …).
    """
    return _safe_count(Order.objects.filter(created_at__gte=_today_start()))


def _get_unmatched_transactions() -> int:
    """
    6.6  Unmatched bank transactions — global, not period-limited.

    Uses ``BankTransaction.MatchStatus.UNMATCHED`` (value ``"unmatched"``).
    Returns 0 if the reconciliation app is unavailable.
    """
    try:
        from reconciliation.models import BankTransaction

        return _safe_count(
            BankTransaction.objects.filter(
                match_status=BankTransaction.MatchStatus.UNMATCHED
            )
        )
    except Exception:
        return 0


def _get_failed_shipments() -> int:
    """
    6.7  Failed shipments — global.

    Covers FAILED_RETRYABLE, FAILED_FINAL and LABEL_DOWNLOAD_FAILED.
    Returns 0 if the shipping app is unavailable.
    """
    try:
        from shipping.models import Shipment

        return _safe_count(
            Shipment.objects.filter(
                status__in=[
                    Shipment.Status.FAILED_RETRYABLE,
                    Shipment.Status.FAILED_FINAL,
                    Shipment.Status.LABEL_DOWNLOAD_FAILED,
                ]
            )
        )
    except Exception:
        return 0


def _get_failed_notifications() -> int:
    """
    6.8  Failed Telegram notifications in the last 7 days.

    Uses ``NotificationLog.Status.FAILED`` (value ``"failed"``).
    Returns 0 if the notifications app is unavailable.
    """
    try:
        from notifications.models import NotificationLog

        cutoff = timezone.now() - timedelta(days=7)
        return _safe_count(
            NotificationLog.objects.filter(
                status=NotificationLog.Status.FAILED,
                created_at__gte=cutoff,
            )
        )
    except Exception:
        return 0


def _get_invoices_this_month() -> int:
    """
    6.9  Invoices with status ISSUED created in the current calendar month.

    Uses current month, not the selected dashboard period.
    Returns 0 if the billing app is unavailable.
    """
    try:
        from billing.models import Invoice

        return _safe_count(
            Invoice.objects.filter(
                status=Invoice.Status.ISSUED,
                created_at__gte=_month_start(),
            )
        )
    except Exception:
        return 0


def _get_credit_notes_this_month() -> int:
    """
    6.10  Credit notes created in the current calendar month.

    Returns 0 if the CreditNote model is unavailable.
    """
    try:
        from billing.models import CreditNote

        return _safe_count(CreditNote.objects.filter(created_at__gte=_month_start()))
    except Exception:
        return 0


def _get_top_product_sold_quantity(date_from: datetime, date_to: datetime) -> int:
    """
    6.11  Quantity of the top-selling product in the selected period (paid orders).

    Returns 0 when no paid order items exist in the period.
    """
    try:
        from django.db.models import Sum as _Sum

        row = (
            OrderItem.objects.filter(
                order__status=REVENUE_ORDER_STATUS,
                order__created_at__gte=date_from,
                order__created_at__lte=timezone.now(),
            )
            .values("product_id")
            .annotate(sold_quantity=_Sum("quantity"))
            .order_by("-sold_quantity")
            .first()
        )
        if row and row["sold_quantity"] is not None:
            return int(row["sold_quantity"])
        return 0
    except Exception:
        return 0


def get_kpis(date_from: datetime, date_to: datetime) -> dict[str, Any]:
    period_orders = _orders_between(date_from, date_to)
    orders_count = _safe_count(period_orders)

    paid_orders = paid_orders_in_period(date_from, date_to)
    paid_orders_count = _safe_count(paid_orders)
    revenue = sum_paid_order_revenue(date_from, date_to)
    average_order_value = (
        revenue / paid_orders_count if paid_orders_count else Decimal("0")
    )

    new_customers = 0
    try:
        if any(f.name == "date_joined" for f in CustomUser._meta.get_fields()):
            new_customers = _safe_count(
                CustomUser.objects.filter(
                    is_staff=False,
                    date_joined__gte=date_from,
                    date_joined__lte=date_to,
                )
            )
    except Exception:
        new_customers = 0

    return {
        # --- Period KPIs ---
        "revenue": _decimal_str(revenue),
        "orders_count": orders_count,
        "paid_orders_count": paid_orders_count,
        "new_customers": new_customers,
        "average_order_value": _decimal_str(average_order_value),
        # 6.3  Pending orders — global (need action regardless of period)
        "pending_orders": _safe_count(Order.objects.filter(status="pending")),
        "completed_orders": _safe_count(
            Order.objects.filter(status__in=COMPLETED_ORDER_STATUSES)
        ),
        "total_products": _safe_count(Product.objects.all()),
        "active_products": _safe_count(Product.objects.filter(active=True)),
        "total_customers": _safe_count(CustomUser.objects.filter(is_staff=False)),
        # --- Today KPIs (6.1, 6.2) ---
        "today_revenue": _get_today_revenue(),
        "today_orders": _get_today_orders(),
        # --- Operations KPIs (6.6 – 6.10) ---
        "unmatched_transactions": _get_unmatched_transactions(),
        "failed_shipments": _get_failed_shipments(),
        "failed_notifications": _get_failed_notifications(),
        "invoices_issued_this_month": _get_invoices_this_month(),
        "credit_notes_this_month": _get_credit_notes_this_month(),
        # --- Product KPI (6.11) ---
        "top_product_sold_quantity": _get_top_product_sold_quantity(date_from, date_to),
    }


def get_sales_chart(date_from: datetime, date_to: datetime) -> list[dict[str, Any]]:
    """
    Daily revenue and order count for the selected period, gaps filled with zeros.

    Each entry: ``{"date": "YYYY-MM-DD", "revenue": "120.00", "orders": 5}``

    ``Order.total_price`` is a Python property so revenue is accumulated via a
    Python loop (see ``paid_order_daily_stats``). The order count comes from the
    same loop to avoid a second query.

    Gap-filling ensures a continuous date series so frontend charts never need
    to special-case missing days.
    """
    try:
        stats: dict[date, dict[str, Any]] = {
            day: {"revenue": rev, "orders": cnt}
            for day, rev, cnt in paid_order_daily_stats(date_from, date_to)
        }
        start = date_from.date()
        end = date_to.date()
        result: list[dict[str, Any]] = []
        current = start
        while current <= end:
            entry = stats.get(current, {"revenue": Decimal("0"), "orders": 0})
            result.append(
                {
                    "date": current.isoformat(),
                    "revenue": _decimal_str(entry["revenue"]),
                    "orders": entry["orders"],
                }
            )
            current += timedelta(days=1)
        return result
    except Exception:
        return []


def get_order_status_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    """
    8.  All orders in the selected period grouped by status.

    Every status defined on the Order model is always present in the output
    (zero-filled for statuses with no orders). This lets the frontend render a
    complete breakdown without having to handle missing keys.
    """
    try:
        counts = {
            row["status"]: row["count"]
            for row in _orders_between(date_from, date_to)
            .values("status")
            .annotate(count=Count("id"))
        }
        return [
            {"status": status, "count": counts.get(status, 0)}
            for status in ORDER_STATUS_CHOICES
        ]
    except Exception:
        return []


def get_invoice_status_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    """
    9.  Invoices in the selected period grouped by status.

    Returns ``[]`` if the billing app or Invoice model is unavailable.
    """
    try:
        from billing.models import Invoice

        end = timezone.now()
        if date_to > end:
            end = date_to
        return list(
            Invoice.objects.filter(
                created_at__gte=date_from,
                created_at__lte=end,
            )
            .values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def get_shipment_status_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    """
    10. Shipments in the selected period grouped by status.

    Returns ``[]`` if the shipping app or Shipment model is unavailable.
    """
    try:
        from shipping.models import Shipment

        end = timezone.now()
        if date_to > end:
            end = date_to
        return list(
            Shipment.objects.filter(
                created_at__gte=date_from,
                created_at__lte=end,
            )
            .values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def get_reconciliation_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    """
    11. BankTransactions in the selected period grouped by match status.

    The DB column is ``match_status``; the output key is normalised to
    ``status`` so all breakdown responses share the same shape.

    Returns ``[]`` if the reconciliation app or BankTransaction model is
    unavailable.
    """
    try:
        from reconciliation.models import BankTransaction

        end = timezone.now()
        if date_to > end:
            end = date_to
        rows = (
            BankTransaction.objects.filter(
                created_at__gte=date_from,
                created_at__lte=end,
            )
            .values("match_status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        return [{"status": row["match_status"], "count": row["count"]} for row in rows]
    except Exception:
        return []


def get_top_products(
    date_from: datetime, date_to: datetime, limit: int = 5
) -> list[dict[str, Any]]:
    """
    12. Top products by sold quantity in the selected period (paid orders only).

    Default limit is 5 for the dashboard home card.

    Output per row:
        ``id``               — product PK
        ``name``             — product name (snapshot from ``item_name``,
                               falls back to ``product__name``)
        ``sold_quantity``    — total units sold (Decimal stored as string)
        ``sold_orders_count``— distinct orders containing this product
        ``revenue``          — line-item revenue (quantity × price, string)

    ``Product.name`` is the confirmed field name (checked on ``api.Product``).
    The ``item_name`` snapshot is preferred so historical orders keep the
    name that was current at purchase time.
    """
    try:
        end = timezone.now()
        if date_to > end:
            end = date_to
        line_total = F("quantity") * Coalesce(
            F("item_price"),
            F("product__base_price"),
            Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
        )
        rows = (
            OrderItem.objects.filter(
                order__status=REVENUE_ORDER_STATUS,
                order__created_at__gte=date_from,
                order__created_at__lte=end,
            )
            .values("product_id")
            .annotate(
                name=Coalesce(F("item_name"), F("product__name"), Value("Unknown")),
                sold_quantity=Sum("quantity"),
                sold_orders_count=Count("order", distinct=True),
                revenue=Sum(
                    line_total,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by("-sold_quantity")[:limit]
        )
        return [
            {
                "id": row["product_id"],
                "name": row["name"],
                "sold_quantity": _decimal_str(row["sold_quantity"]),
                "sold_orders_count": row["sold_orders_count"],
                "revenue": _decimal_str(row["revenue"]),
            }
            for row in rows
        ]
    except Exception:
        return []


def _order_reference(order: Order) -> str:
    if order.delivery_date_order_id:
        return str(order.delivery_date_order_id)
    return str(order.pk)


def _customer_display_name(order: Order) -> str:
    if order.customer_id and order.customer:
        return order.customer.name or order.customer.email or "Unknown customer"
    return "Guest"


def get_recent_orders(limit: int = 10) -> list[dict[str, Any]]:
    try:
        orders = Order.objects.select_related("customer").order_by("-created_at")[:limit]
        results = []
        for order in orders:
            try:
                total = order_total_amount(order)
            except Exception:
                total = Decimal("0")
            results.append(
                {
                    "id": order.pk,
                    "reference": _order_reference(order),
                    "customer_name": _customer_display_name(order),
                    "status": order.status,
                    "payment_status": order.payment_status,
                    "source": order.source,
                    "total": _decimal_str(total),
                    "created_at": order.created_at.isoformat()
                    if order.created_at
                    else None,
                    "delivery_date": order.delivery_date.isoformat()
                    if order.delivery_date
                    else None,
                }
            )
        return results
    except Exception:
        return []


def get_alerts() -> dict[str, Any]:
    items: list[dict[str, Any]] = []

    pending_orders = _safe_count(Order.objects.filter(status="pending"))
    if pending_orders:
        items.append(
            {
                "type": "pending_orders",
                "severity": "warning",
                "count": pending_orders,
                "message": f"{pending_orders} order(s) awaiting payment or processing.",
            }
        )

    unreconciled_bank_transactions = 0
    try:
        from reconciliation.models import BankTransaction

        unreconciled_bank_transactions = _safe_count(
            BankTransaction.objects.filter(
                match_status__in=[
                    BankTransaction.MatchStatus.UNMATCHED,
                    BankTransaction.MatchStatus.SUGGESTED,
                ]
            )
        )
        if unreconciled_bank_transactions:
            items.append(
                {
                    "type": "unreconciled_bank_transactions",
                    "severity": "warning",
                    "count": unreconciled_bank_transactions,
                    "message": (
                        f"{unreconciled_bank_transactions} bank transaction(s) "
                        "need reconciliation."
                    ),
                }
            )
    except Exception:
        pass

    unpaid_invoices = 0
    try:
        from billing.models import Invoice

        unpaid_invoices = _safe_count(
            Invoice.objects.filter(
                status__in=[Invoice.Status.ISSUED, Invoice.Status.PART_PAID],
            )
        )
        if unpaid_invoices:
            items.append(
                {
                    "type": "unpaid_invoices",
                    "severity": "warning",
                    "count": unpaid_invoices,
                    "message": f"{unpaid_invoices} invoice(s) with outstanding balance.",
                }
            )
    except Exception:
        pass

    failed_shipments = 0
    try:
        from shipping.models import Shipment

        failed_shipments = _safe_count(
            Shipment.objects.filter(
                status__in=[
                    Shipment.Status.FAILED_RETRYABLE,
                    Shipment.Status.FAILED_FINAL,
                    Shipment.Status.LABEL_DOWNLOAD_FAILED,
                ]
            )
        )
        if failed_shipments:
            items.append(
                {
                    "type": "failed_shipments",
                    "severity": "error",
                    "count": failed_shipments,
                    "message": f"{failed_shipments} shipment(s) require attention.",
                }
            )
    except Exception:
        pass

    failed_notifications = 0
    try:
        from notifications.models import NotificationLog

        failed_notifications = _safe_count(
            NotificationLog.objects.filter(
                status=NotificationLog.Status.FAILED,
                created_at__gte=timezone.now() - timedelta(days=7),
            )
        )
        if failed_notifications:
            items.append(
                {
                    "type": "failed_notifications",
                    "severity": "error",
                    "count": failed_notifications,
                    "message": (
                        f"{failed_notifications} Telegram notification(s) failed "
                        "in the last 7 days."
                    ),
                }
            )
    except Exception:
        pass

    return {
        "items": items,
        "pending_orders": pending_orders,
        "unreconciled_bank_transactions": unreconciled_bank_transactions,
        "unpaid_invoices": unpaid_invoices,
        "failed_shipments": failed_shipments,
        "failed_notifications": failed_notifications,
    }


def get_summary_snapshot() -> dict[str, Any]:
    """Legacy-compatible totals for /api/dashboard/summary/."""
    alerts = get_alerts()
    total_shipments = 0
    try:
        from shipping.models import Shipment

        total_shipments = _safe_count(Shipment.objects.all())
    except Exception:
        pass

    return {
        "total_orders": _safe_count(Order.objects.all()),
        "pending_orders": alerts["pending_orders"],
        "completed_orders": _safe_count(
            Order.objects.filter(status__in=COMPLETED_ORDER_STATUSES)
        ),
        "total_products": _safe_count(Product.objects.all()),
        "active_products": _safe_count(Product.objects.filter(active=True)),
        "total_customers": _safe_count(CustomUser.objects.filter(is_staff=False)),
        "total_shipments": total_shipments,
        "unreconciled_bank_transactions": alerts["unreconciled_bank_transactions"],
    }


def get_orders_by_source_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    try:
        return list(
            _orders_between(date_from, date_to)
            .values("source")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def get_dashboard_data(period: str) -> dict[str, Any]:
    period_key = normalize_period(period)
    date_from, date_to = get_period_range(period)
    alerts = get_alerts()

    return {
        "period": period_key,
        "period_start": date_from.isoformat(),
        "period_end": date_to.isoformat(),
        "kpis": get_kpis(date_from, date_to),
        "charts": {
            "sales_chart": get_sales_chart(date_from, date_to),
        },
        "recent_orders": get_recent_orders(),
        "breakdowns": {
            "order_status_breakdown": get_order_status_breakdown(date_from, date_to),
            "orders_by_source": get_orders_by_source_breakdown(date_from, date_to),
            "invoice_status_breakdown": get_invoice_status_breakdown(date_from, date_to),
            "shipment_status_breakdown": get_shipment_status_breakdown(date_from, date_to),
            "reconciliation_breakdown": get_reconciliation_breakdown(date_from, date_to),
        },
        "top_products": get_top_products(date_from, date_to),
        "alerts": alerts["items"],
        "summary": get_summary_snapshot(),
    }
