from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from api.services.product_sales import SOLD_ORDER_STATUSES
from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from .periods import DashboardPeriod

# Operational order statuses for dashboard breakdowns
ORDER_STATUS_CHOICES = [choice[0] for choice in Order._meta.get_field("status").choices]
COMPLETED_ORDER_STATUSES = ("delivered",)
PAID_ORDER_STATUSES = SOLD_ORDER_STATUSES


def _decimal_str(value: Decimal | int | float | None) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(str(value)).quantize(Decimal('0.01'))}"


def _safe_count(qs) -> int:
    try:
        return qs.count()
    except Exception:
        return 0


def _order_reference(order: Order) -> str:
    if order.delivery_date_order_id:
        return str(order.delivery_date_order_id)
    return str(order.pk)


def _customer_display_name(order: Order) -> str:
    if order.customer_id and order.customer:
        return order.customer.name or order.customer.email or "Unknown customer"
    return "Guest"


def _orders_in_period(period: DashboardPeriod):
    return Order.objects.filter(
        created_at__gte=period.start,
        created_at__lt=period.end,
    )


def _build_kpis(period: DashboardPeriod) -> dict[str, Any]:
    period_orders = _orders_in_period(period)
    orders_count = _safe_count(period_orders)

    revenue = Decimal("0")
    try:
        from billing.models import Invoice

        revenue = (
            Invoice.objects.filter(
                created_at__gte=period.start,
                created_at__lt=period.end,
            )
            .exclude(status=Invoice.Status.VOID)
            .aggregate(total=Sum("total_amount"))["total"]
            or Decimal("0")
        )
    except Exception:
        revenue = Decimal("0")

    paid_orders_in_period = _safe_count(
        period_orders.filter(status__in=PAID_ORDER_STATUSES)
    )
    average_order_value = (
        revenue / paid_orders_in_period if paid_orders_in_period else Decimal("0")
    )

    new_customers = 0
    try:
        if any(f.name == "date_joined" for f in CustomUser._meta.get_fields()):
            new_customers = _safe_count(
                CustomUser.objects.filter(
                    is_staff=False,
                    date_joined__gte=period.start,
                    date_joined__lt=period.end,
                )
            )
    except Exception:
        new_customers = 0

    return {
        "revenue": _decimal_str(revenue),
        "orders_count": orders_count,
        "paid_orders_count": paid_orders_in_period,
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


def _build_revenue_chart(period: DashboardPeriod) -> list[dict[str, Any]]:
    try:
        from billing.models import Invoice

        rows = (
            Invoice.objects.filter(
                created_at__gte=period.start,
                created_at__lt=period.end,
            )
            .exclude(status=Invoice.Status.VOID)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(value=Sum("total_amount"))
            .order_by("day")
        )
        return [
            {
                "date": row["day"].isoformat() if row["day"] else None,
                "value": _decimal_str(row["value"]),
            }
            for row in rows
            if row["day"]
        ]
    except Exception:
        return []


def _build_orders_chart(period: DashboardPeriod) -> list[dict[str, Any]]:
    try:
        rows = (
            _orders_in_period(period)
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


def _build_recent_orders(limit: int = 10) -> list[dict[str, Any]]:
    try:
        orders = (
            Order.objects.select_related("customer")
            .order_by("-created_at")[:limit]
        )
        results = []
        for order in orders:
            try:
                total = order.total_price
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


def _build_orders_by_status(period: DashboardPeriod) -> list[dict[str, Any]]:
    try:
        counts = {
            row["status"]: row["count"]
            for row in _orders_in_period(period)
            .values("status")
            .annotate(count=Count("id"))
        }
        return [
            {"status": status, "count": counts.get(status, 0)}
            for status in ORDER_STATUS_CHOICES
        ]
    except Exception:
        return []


def _build_orders_by_source(period: DashboardPeriod) -> list[dict[str, Any]]:
    try:
        return list(
            _orders_in_period(period)
            .values("source")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def _build_invoices_by_status(period: DashboardPeriod) -> list[dict[str, Any]]:
    try:
        from billing.models import Invoice

        return list(
            Invoice.objects.filter(
                created_at__gte=period.start,
                created_at__lt=period.end,
            )
            .values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def _build_shipments_by_status(period: DashboardPeriod) -> list[dict[str, Any]]:
    try:
        from shipping.models import Shipment

        return list(
            Shipment.objects.filter(
                created_at__gte=period.start,
                created_at__lt=period.end,
            )
            .values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
    except Exception:
        return []


def _build_top_products(period: DashboardPeriod, limit: int = 10) -> list[dict[str, Any]]:
    try:
        line_total = F("quantity") * Coalesce(
            F("item_price"),
            F("product__base_price"),
            Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
        )
        rows = (
            OrderItem.objects.filter(
                order__created_at__gte=period.start,
                order__created_at__lt=period.end,
            )
            .exclude(order__status="cancelled")
            .values("product_id")
            .annotate(
                name=Coalesce(F("item_name"), F("product__name"), Value("Unknown")),
                quantity_sold=Sum("quantity"),
                revenue=Sum(line_total, output_field=DecimalField(max_digits=12, decimal_places=2)),
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


def _build_alerts() -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    pending = _safe_count(Order.objects.filter(status="pending"))
    if pending:
        alerts.append(
            {
                "type": "pending_orders",
                "severity": "warning",
                "count": pending,
                "message": f"{pending} order(s) awaiting payment or processing.",
            }
        )

    try:
        from reconciliation.models import BankTransaction

        unreconciled = _safe_count(
            BankTransaction.objects.filter(
                match_status__in=[
                    BankTransaction.MatchStatus.UNMATCHED,
                    BankTransaction.MatchStatus.SUGGESTED,
                ]
            )
        )
        if unreconciled:
            alerts.append(
                {
                    "type": "unreconciled_bank_transactions",
                    "severity": "warning",
                    "count": unreconciled,
                    "message": f"{unreconciled} bank transaction(s) need reconciliation.",
                }
            )
    except Exception:
        pass

    try:
        from billing.models import Invoice

        unpaid = _safe_count(
            Invoice.objects.filter(
                status__in=[Invoice.Status.ISSUED, Invoice.Status.PART_PAID],
            )
        )
        if unpaid:
            alerts.append(
                {
                    "type": "unpaid_invoices",
                    "severity": "warning",
                    "count": unpaid,
                    "message": f"{unpaid} invoice(s) with outstanding balance.",
                }
            )
    except Exception:
        pass

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
            alerts.append(
                {
                    "type": "failed_shipments",
                    "severity": "error",
                    "count": failed_shipments,
                    "message": f"{failed_shipments} shipment(s) require attention.",
                }
            )
    except Exception:
        pass

    try:
        from notifications.models import NotificationLog

        failed_notifications = _safe_count(
            NotificationLog.objects.filter(
                status=NotificationLog.Status.FAILED,
                created_at__gte=timezone.now() - timedelta(days=7),
            )
        )
        if failed_notifications:
            alerts.append(
                {
                    "type": "failed_notifications",
                    "severity": "error",
                    "count": failed_notifications,
                    "message": f"{failed_notifications} Telegram notification(s) failed in the last 7 days.",
                }
            )
    except Exception:
        pass

    return alerts


def _build_summary_snapshot() -> dict[str, Any]:
    """Legacy-compatible totals for existing dashboard summary cards."""
    unreconciled = 0
    total_shipments = 0
    try:
        from reconciliation.models import BankTransaction

        unreconciled = _safe_count(
            BankTransaction.objects.filter(
                match_status__in=[
                    BankTransaction.MatchStatus.UNMATCHED,
                    BankTransaction.MatchStatus.SUGGESTED,
                ]
            )
        )
    except Exception:
        pass

    try:
        from shipping.models import Shipment

        total_shipments = _safe_count(Shipment.objects.all())
    except Exception:
        pass

    return {
        "total_orders": _safe_count(Order.objects.all()),
        "pending_orders": _safe_count(Order.objects.filter(status="pending")),
        "completed_orders": _safe_count(
            Order.objects.filter(status__in=COMPLETED_ORDER_STATUSES)
        ),
        "total_products": _safe_count(Product.objects.all()),
        "active_products": _safe_count(Product.objects.filter(active=True)),
        "total_customers": _safe_count(CustomUser.objects.filter(is_staff=False)),
        "total_shipments": total_shipments,
        "unreconciled_bank_transactions": unreconciled,
    }


def build_admin_dashboard(period: DashboardPeriod) -> dict[str, Any]:
    return {
        "period": period.key,
        "period_start": period.start.isoformat(),
        "period_end": period.end.isoformat(),
        "kpis": _build_kpis(period),
        "charts": {
            "revenue_by_day": _build_revenue_chart(period),
            "orders_by_day": _build_orders_chart(period),
        },
        "recent_orders": _build_recent_orders(),
        "breakdowns": {
            "orders_by_status": _build_orders_by_status(period),
            "orders_by_source": _build_orders_by_source(period),
            "invoices_by_status": _build_invoices_by_status(period),
            "shipments_by_status": _build_shipments_by_status(period),
        },
        "top_products": _build_top_products(period),
        "alerts": _build_alerts(),
        "summary": _build_summary_snapshot(),
    }


def build_admin_dashboard_summary_only() -> dict:
    return _build_summary_snapshot()
