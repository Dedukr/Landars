from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from admin_dashboard.periods import get_period_range, normalize_period
from admin_dashboard.revenue import (
    REVENUE_ORDER_STATUS,
    order_total_amount,
    paid_order_revenue_by_day,
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
        "revenue": _decimal_str(revenue),
        "orders_count": orders_count,
        "paid_orders_count": paid_orders_count,
        "new_customers": new_customers,
        "average_order_value": _decimal_str(average_order_value),
        "pending_orders": _safe_count(Order.objects.filter(status="pending")),
        "completed_orders": _safe_count(
            Order.objects.filter(status__in=COMPLETED_ORDER_STATUSES)
        ),
        "total_products": _safe_count(Product.objects.all()),
        "active_products": _safe_count(Product.objects.filter(active=True)),
        "total_customers": _safe_count(CustomUser.objects.filter(is_staff=False)),
    }


def get_sales_chart(date_from: datetime, date_to: datetime) -> list[dict[str, Any]]:
    """Daily revenue from paid orders (sum of order totals)."""
    try:
        return [
            {"date": day.isoformat(), "value": _decimal_str(amount)}
            for day, amount in paid_order_revenue_by_day(date_from, date_to)
        ]
    except Exception:
        return []


def _get_orders_chart(date_from: datetime, date_to: datetime) -> list[dict[str, Any]]:
    try:
        rows = (
            _orders_between(date_from, date_to)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(value=Count("id"))
            .order_by("day")
        )
        return [
            {"date": row["day"].isoformat(), "value": row["value"] or 0}
            for row in rows
            if row["day"]
        ]
    except Exception:
        return []


def get_order_status_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
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
    try:
        from billing.models import Invoice

        return list(
            Invoice.objects.filter(
                created_at__gte=date_from,
                created_at__lte=date_to,
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
    try:
        from shipping.models import Shipment

        return list(
            Shipment.objects.filter(
                created_at__gte=date_from,
                created_at__lte=date_to,
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
    try:
        from reconciliation.models import BankTransaction

        return list(
            BankTransaction.objects.filter(
                created_at__gte=date_from,
                created_at__lte=date_to,
            )
            .values("match_status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def get_top_products(
    date_from: datetime, date_to: datetime, limit: int = 10
) -> list[dict[str, Any]]:
    try:
        line_total = F("quantity") * Coalesce(
            F("item_price"),
            F("product__base_price"),
            Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
        )
        rows = (
            OrderItem.objects.filter(
                order__status=REVENUE_ORDER_STATUS,
                order__created_at__gte=date_from,
                order__created_at__lte=date_to,
            )
            .values("product_id")
            .annotate(
                name=Coalesce(F("item_name"), F("product__name"), Value("Unknown")),
                quantity_sold=Sum("quantity"),
                revenue=Sum(
                    line_total,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by("-quantity_sold")[:limit]
        )
        return [
            {
                "product_id": row["product_id"],
                "name": row["name"],
                "quantity_sold": _decimal_str(row["quantity_sold"]),
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
            "revenue_by_day": get_sales_chart(date_from, date_to),
            "orders_by_day": _get_orders_chart(date_from, date_to),
        },
        "recent_orders": get_recent_orders(),
        "breakdowns": {
            "orders_by_status": get_order_status_breakdown(date_from, date_to),
            "orders_by_source": get_orders_by_source_breakdown(date_from, date_to),
            "invoices_by_status": get_invoice_status_breakdown(date_from, date_to),
            "shipments_by_status": get_shipment_status_breakdown(date_from, date_to),
            "reconciliation_by_status": get_reconciliation_breakdown(date_from, date_to),
        },
        "top_products": get_top_products(date_from, date_to),
        "alerts": alerts["items"],
        "summary": get_summary_snapshot(),
    }
