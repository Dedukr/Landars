from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

logger = logging.getLogger(__name__)

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


def money(value: Decimal | int | float | None) -> str:
    """
    Format a numeric value as a two-decimal money string (section 18).

    Uses Python's format spec ``:.2f`` which applies ROUND_HALF_EVEN on
    ``Decimal`` objects — the same as ``quantize(Decimal('0.01'))``.
    Returns ``"0.00"`` for ``None`` so the frontend never receives null.

    Examples::

        money(Decimal("10"))      → "10.00"
        money(Decimal("9.999"))   → "10.00"
        money(0)                  → "0.00"
        money(None)               → "0.00"
    """
    if value is None:
        return "0.00"
    return f"{value:.2f}"


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
    6.1  Today revenue — DB-aggregated revenue for paid orders created today.

    Delegates to ``sum_paid_order_revenue`` (section 19) which uses
    ``Sum(quantity × item_price)`` + delivery adjustments via the ORM.
    """
    start = _today_start()
    return money(sum_paid_order_revenue(start, timezone.now()))


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
    Returns 0 if the reconciliation app is unavailable (Option B, section 20).
    """
    try:
        from reconciliation.models import BankTransaction
    except ImportError:
        return 0  # app not installed — expected, no log needed
    try:
        return _safe_count(
            BankTransaction.objects.filter(
                match_status=BankTransaction.MatchStatus.UNMATCHED
            )
        )
    except Exception:
        logger.warning("_get_unmatched_transactions query failed", exc_info=True)
        return 0


def _get_failed_shipments() -> int:
    """
    6.7  Failed shipments — global.

    Covers FAILED_RETRYABLE, FAILED_FINAL and LABEL_DOWNLOAD_FAILED.
    Returns 0 if the shipping app is unavailable (Option B, section 20).
    """
    try:
        from shipping.models import Shipment
    except ImportError:
        return 0
    try:
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
        logger.warning("_get_failed_shipments query failed", exc_info=True)
        return 0


def _get_failed_notifications() -> int:
    """
    6.8  Failed Telegram notifications in the last 7 days.

    Uses ``NotificationLog.Status.FAILED`` (value ``"failed"``).
    Returns 0 if the notifications app is unavailable (Option B, section 20).
    """
    try:
        from notifications.models import NotificationLog
    except ImportError:
        return 0
    try:
        cutoff = timezone.now() - timedelta(days=7)
        return _safe_count(
            NotificationLog.objects.filter(
                status=NotificationLog.Status.FAILED,
                created_at__gte=cutoff,
            )
        )
    except Exception:
        logger.warning("_get_failed_notifications query failed", exc_info=True)
        return 0


def _get_invoices_this_month() -> int:
    """
    6.9  Invoices with status ISSUED created in the current calendar month.

    Uses current month, not the selected dashboard period.
    Returns 0 if the billing app is unavailable (Option B, section 20).
    """
    try:
        from billing.models import Invoice
    except ImportError:
        return 0
    try:
        return _safe_count(
            Invoice.objects.filter(
                status=Invoice.Status.ISSUED,
                created_at__gte=_month_start(),
            )
        )
    except Exception:
        logger.warning("_get_invoices_this_month query failed", exc_info=True)
        return 0


def _get_credit_notes_this_month() -> int:
    """
    6.10  Credit notes created in the current calendar month.

    Returns 0 if the CreditNote model is unavailable (Option B, section 20).
    """
    try:
        from billing.models import CreditNote
    except ImportError:
        return 0
    try:
        return _safe_count(CreditNote.objects.filter(created_at__gte=_month_start()))
    except Exception:
        logger.warning("_get_credit_notes_this_month query failed", exc_info=True)
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
    """
    All KPI card values for the selected period.

    Performance (section 19):
    - Counts use DB ``COUNT()`` via ``_safe_count(qs)``.
    - Revenue uses ``sum_paid_order_revenue()`` → DB ``Sum(quantity×item_price)``.
    - ``average_order_value`` is Python arithmetic on the already-computed
      revenue and count (no additional query).
    - All per-app helpers (_get_* functions) use DB aggregation; they return 0
      on ImportError so unavailable apps degrade gracefully.
    """
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
        "revenue": money(revenue),
        "orders_count": orders_count,
        # spec key: paid_orders (was paid_orders_count)
        "paid_orders": paid_orders_count,
        "new_customers": new_customers,
        "average_order_value": money(average_order_value),
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

    Revenue and order count are DB-aggregated via ``paid_order_daily_stats``
    (``TruncDate`` + ``Sum`` + ``Count`` on ``OrderItem``) — no Python loops
    over order objects.

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
                    "revenue": money(entry["revenue"]),
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

    Returns ``[]`` if the billing app or Invoice model is unavailable (Option B,
    section 20).
    """
    try:
        from billing.models import Invoice
    except ImportError:
        return []
    try:
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
        logger.warning("get_invoice_status_breakdown query failed", exc_info=True)
        return []


def get_shipment_status_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    """
    10. Shipments in the selected period grouped by status.

    Returns ``[]`` if the shipping app or Shipment model is unavailable (Option B,
    section 20).
    """
    try:
        from shipping.models import Shipment
    except ImportError:
        return []
    try:
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
        logger.warning("get_shipment_status_breakdown query failed", exc_info=True)
        return []


def get_reconciliation_breakdown(
    date_from: datetime, date_to: datetime
) -> list[dict[str, Any]]:
    """
    11. BankTransactions in the selected period grouped by match status.

    The DB column is ``match_status``; the output key is normalised to
    ``status`` so all breakdown responses share the same shape.

    Returns ``[]`` if the reconciliation app or BankTransaction model is
    unavailable (Option B, section 20).
    """
    try:
        from reconciliation.models import BankTransaction
    except ImportError:
        return []
    try:
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
        logger.warning("get_reconciliation_breakdown query failed", exc_info=True)
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
                "sold_quantity": money(row["sold_quantity"]),
                "sold_orders_count": row["sold_orders_count"],
                "revenue": money(row["revenue"]),
            }
            for row in rows
        ]
    except Exception:
        return []


def _order_reference(order: Order) -> str:
    """
    Human-readable order reference.

    The Order model has no dedicated formatted reference field. We use the
    global PK zero-padded to 6 digits (e.g. ``#000123``) so the reference is
    globally unique and frontend-friendly. If the project later adds an
    ``order_number`` or ``reference`` field this function should be updated.
    """
    return f"#{order.pk:06d}"


def _customer_display_name(order: Order) -> str:
    """
    13.  Customer name resolution priority:

    1. ``order.customer_name`` snapshot — does not exist on this model yet;
       kept as a forward-compatible hook.
    2. ``order.customer.profile.name``  — Profile.name is currently commented
       out; guarded by hasattr so it works if the field is added later.
    3. ``order.customer.name``          — primary name field on CustomUser.
    4. ``order.customer.email``         — email fallback.
    5. "Guest"                          — customer FK is null.
    """
    # 1. Snapshot field (not yet on model — forward-compatible check)
    snapshot = getattr(order, "customer_name", None)
    if snapshot:
        return snapshot

    customer = order.customer if order.customer_id else None
    if not customer:
        return "Guest"

    # 2. Profile name (field is currently commented out; safe guard)
    try:
        profile = customer.profile  # related_name="profile"
        profile_name = getattr(profile, "name", None)
        if profile_name:
            return profile_name
    except Exception:
        pass

    # 3. Primary name field on CustomUser
    if customer.name:
        return customer.name

    # 4. Email fallback
    if customer.email:
        return customer.email

    return "Unknown customer"


# Statuses that represent ephemeral/incomplete orders (not real orders).
# The Order model currently has no draft/cart status, but the exclusion is
# kept forward-compatibly so adding them later does not affect recent-orders.
_EPHEMERAL_ORDER_STATUSES = ["draft", "cart"]


def get_recent_orders(limit: int = 10) -> list[dict[str, Any]]:
    """
    13.  Latest ``limit`` real orders, newest first.

    Uses ``select_related`` to avoid N+1 queries for customer and profile.
    Excludes ephemeral statuses (draft, cart) — currently none exist on the
    model, but the exclusion is forward-compatible.
    """
    try:
        orders = (
            Order.objects.select_related("customer", "customer__profile")
            .prefetch_related("items", "items__product")
            .exclude(status__in=_EPHEMERAL_ORDER_STATUSES)
            .order_by("-created_at")[:limit]
        )
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
                    "total": money(total),
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
        try:
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
            logger.warning("get_alerts: unreconciled_bank_transactions query failed", exc_info=True)
    except ImportError:
        pass

    unpaid_invoices = 0
    try:
        from billing.models import Invoice
        try:
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
            logger.warning("get_alerts: unpaid_invoices query failed", exc_info=True)
    except ImportError:
        pass

    failed_shipments = 0
    try:
        from shipping.models import Shipment
        try:
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
            logger.warning("get_alerts: failed_shipments query failed", exc_info=True)
    except ImportError:
        pass

    failed_notifications = 0
    try:
        from notifications.models import NotificationLog
        try:
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
            logger.warning("get_alerts: failed_notifications query failed", exc_info=True)
    except ImportError:
        pass

    return {
        "items": items,
        "pending_orders": pending_orders,
        "unreconciled_bank_transactions": unreconciled_bank_transactions,
        "unpaid_invoices": unpaid_invoices,
        "failed_shipments": failed_shipments,
        "failed_notifications": failed_notifications,
    }


def get_alert_records(limit: int = 5) -> dict[str, list[dict[str, Any]]]:
    """
    14.  Alert records — actual problem objects for the dashboard alert panel.

    Returns a dict with three keys, each containing up to ``limit`` records.
    Any app that is unavailable (ImportError or DoesNotExist) falls back to [].

    14.1 failed_shipments  — Shipments in a failed status.
         Fields: id, order_id, status, message (last_error), created_at.

    14.2 unmatched_transactions — BankTransactions with match_status UNMATCHED.
         Fields: id, amount, reference (payer_name), statement_date, created_at.

    14.3 failed_notifications  — NotificationLogs with status FAILED, last 7 d.
         Fields: id, order_id, event, error (error_message), created_at.
    """
    # 14.1 ─ Failed shipments
    failed_shipments: list[dict[str, Any]] = []
    try:
        from shipping.models import Shipment
        try:
            qs = Shipment.objects.filter(
                status__in=[
                    Shipment.Status.FAILED_RETRYABLE,
                    Shipment.Status.FAILED_FINAL,
                    Shipment.Status.LABEL_DOWNLOAD_FAILED,
                ]
            ).order_by("-created_at")[:limit]
            for s in qs:
                failed_shipments.append(
                    {
                        "id": s.pk,
                        "order_id": s.order_id,
                        "status": s.status,
                        "message": s.last_error or "",
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                    }
                )
        except Exception:
            logger.warning("get_alert_records: failed_shipments query failed", exc_info=True)
    except ImportError:
        pass  # shipping app not installed — expected

    # 14.2 ─ Unmatched bank transactions
    unmatched_transactions: list[dict[str, Any]] = []
    try:
        from reconciliation.models import BankTransaction
        try:
            qs = BankTransaction.objects.filter(
                match_status=BankTransaction.MatchStatus.UNMATCHED
            ).order_by("-created_at")[:limit]
            for tx in qs:
                unmatched_transactions.append(
                    {
                        "id": tx.pk,
                        "amount": money(tx.amount),
                        # payer_name is the most human-readable reference on this model;
                        # the raw statement line is in tx.raw_line if more detail is needed.
                        "reference": tx.payer_name or "",
                        "statement_date": tx.statement_date or "",
                        "created_at": tx.created_at.isoformat() if tx.created_at else None,
                    }
                )
        except Exception:
            logger.warning("get_alert_records: unmatched_transactions query failed", exc_info=True)
    except ImportError:
        pass  # reconciliation app not installed — expected

    # 14.3 ─ Failed Telegram notifications (last 7 days)
    failed_notifications: list[dict[str, Any]] = []
    try:
        from notifications.models import NotificationLog
        try:
            cutoff = timezone.now() - timedelta(days=7)
            qs = NotificationLog.objects.filter(
                status=NotificationLog.Status.FAILED,
                created_at__gte=cutoff,
            ).order_by("-created_at")[:limit]
            for n in qs:
                failed_notifications.append(
                    {
                        "id": n.pk,
                        "order_id": n.order_id,
                        "event": n.event,
                        "error": n.error_message or "",
                        "created_at": n.created_at.isoformat() if n.created_at else None,
                    }
                )
        except Exception:
            logger.warning("get_alert_records: failed_notifications query failed", exc_info=True)
    except ImportError:
        pass  # notifications app not installed — expected

    return {
        "failed_shipments": failed_shipments,
        "unmatched_transactions": unmatched_transactions,
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

    return {
        # Period metadata (informative, not in the spec minimum but useful)
        "period": period_key,
        "period_start": date_from.isoformat(),
        "period_end": date_to.isoformat(),
        # KPI cards
        "kpis": get_kpis(date_from, date_to),
        # Sales chart — flat top-level key per spec (section 17)
        "sales_chart": get_sales_chart(date_from, date_to),
        # Recent orders list
        "recent_orders": get_recent_orders(),
        # Breakdown lists — flat top-level keys per spec (section 17)
        "order_status_breakdown": get_order_status_breakdown(date_from, date_to),
        "orders_by_source": get_orders_by_source_breakdown(date_from, date_to),
        "invoice_status_breakdown": get_invoice_status_breakdown(date_from, date_to),
        "shipment_status_breakdown": get_shipment_status_breakdown(date_from, date_to),
        "reconciliation_breakdown": get_reconciliation_breakdown(date_from, date_to),
        # Top products
        "top_products": get_top_products(date_from, date_to),
        # Alert records grouped by type (section 14)
        "alerts": get_alert_records(),
        # Legacy summary (used by /api/dashboard/summary/ shim)
        "summary": get_summary_snapshot(),
    }
