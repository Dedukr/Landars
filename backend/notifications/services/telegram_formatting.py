from __future__ import annotations

import html
from decimal import Decimal
from typing import TYPE_CHECKING

from django.conf import settings
from django.urls import reverse
from django.utils import timezone

if TYPE_CHECKING:
    from api.models import Order


def format_money(value) -> str:
    """Format a numeric value as GBP."""
    if value is None or value == "":
        return ""
    try:
        amount = Decimal(str(value))
    except Exception:
        return ""
    return f"£{amount:.2f}"


def _item_display_name(item) -> str:
    if item.item_name:
        return item.item_name
    if item.product:
        return item.product.name
    return "Unknown item"


def _item_line_total(item) -> str:
    total = item.get_total_price()
    if total == "" or total is None:
        return ""
    return format_money(total)


def format_order_items_for_telegram(order: Order, max_items: int = 5) -> str:
    items = list(order.items.all())
    if not items:
        return ""

    lines: list[str] = []
    for item in items[:max_items]:
        name = html.escape(_item_display_name(item))
        qty = item.quantity
        line_total = _item_line_total(item)
        if line_total:
            lines.append(f"• {qty} × {name} — {html.escape(line_total)}")
        else:
            lines.append(f"• {qty} × {name}")

    remaining = len(items) - max_items
    if remaining > 0:
        lines.append(f"+ {remaining} more item{'s' if remaining != 1 else ''}")

    return "\n".join(lines)


def _order_reference(order: Order) -> str:
    if order.delivery_date and order.delivery_date_order_id:
        return (
            f"#{order.id} "
            f"(slot {order.delivery_date_order_id} · "
            f"{order.delivery_date.strftime('%Y-%m-%d')})"
        )
    return f"#{order.id}"


def _customer_name(order: Order) -> str:
    if order.customer and order.customer.name:
        return order.customer.name
    return ""


def _customer_email(order: Order) -> str:
    if order.customer and order.customer.email:
        return order.customer.email
    return ""


def _customer_phone(order: Order) -> str:
    if not order.customer:
        return ""
    profile = getattr(order.customer, "profile", None)
    if profile and profile.phone and profile.phone.strip():
        return profile.phone.strip()
    return ""


def _delivery_method(order: Order) -> str:
    if order.is_home_delivery:
        return "Home delivery"
    return "Post / collection"


def _format_created_at(order: Order) -> str:
    if not order.created_at:
        return ""
    local_dt = timezone.localtime(order.created_at)
    return local_dt.strftime("%d %b %Y, %H:%M %Z")


def _admin_order_url(order: Order) -> str:
    site_url = (getattr(settings, "SITE_URL", None) or "").rstrip("/")
    if not site_url:
        return ""
    try:
        path = reverse("admin:api_order_change", args=[order.pk])
    except Exception:
        return ""
    return f"{site_url}{path}"


def format_order_for_telegram(order: Order) -> str:
    """Build HTML-formatted Telegram message for a new frontend order."""
    lines: list[str] = ["🛒 <b>New LandarsFood order</b>", ""]

    reference = _order_reference(order)
    if reference:
        lines.append(f"<b>Order:</b> {html.escape(reference)}")

    customer_name = _customer_name(order)
    if customer_name:
        lines.append(f"<b>Customer:</b> {html.escape(customer_name)}")

    phone = _customer_phone(order)
    if phone:
        lines.append(f"<b>Phone:</b> {html.escape(phone)}")

    email = _customer_email(order)
    if email:
        lines.append(f"<b>Email:</b> {html.escape(email)}")

    items_text = format_order_items_for_telegram(order)
    if items_text:
        lines.extend(["", "<b>Items:</b>", items_text])

    total = format_money(order.total_price)
    if total:
        lines.extend(["", f"<b>Total:</b> {html.escape(total)}"])

    method = _delivery_method(order)
    lines.append(f"<b>Method:</b> {html.escape(method)}")

    address = order.customer_address
    if address and address != "No Address":
        lines.append(f"<b>Address:</b> {html.escape(address)}")

    if order.delivery_date:
        lines.append(
            f"<b>Delivery date:</b> {html.escape(order.delivery_date.strftime('%Y-%m-%d'))}"
        )

    status = order.get_status_display() if hasattr(order, "get_status_display") else order.status
    if status:
        lines.append(f"<b>Status:</b> {html.escape(str(status))}")

    created = _format_created_at(order)
    if created:
        lines.append(f"<b>Created:</b> {html.escape(created)}")

    admin_url = _admin_order_url(order)
    if admin_url:
        safe_url = html.escape(admin_url, quote=True)
        lines.extend(["", f'<a href="{safe_url}">Open in Django admin</a>'])

    return "\n".join(lines)
