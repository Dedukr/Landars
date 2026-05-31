from __future__ import annotations

import html
from decimal import Decimal
from typing import TYPE_CHECKING

from django.conf import settings
from django.urls import reverse
from django.utils import timezone

if TYPE_CHECKING:
    from api.models import Order


def _phone_to_whatsapp_url(phone: str) -> str:
    """
    Build a WhatsApp link for a UK phone number.
    Format: https://wa.me/[number] with no +, spaces, dashes, or leading 0.
    """
    if not phone:
        return ""
    digits = "".join(c for c in str(phone) if c.isdigit())
    digits = digits.lstrip("0") or "0"
    if digits == "0":
        return ""
    if len(digits) == 10 and digits[0] == "7":
        digits = "44" + digits
    return f"https://wa.me/{digits}"


def _format_phone_line_for_telegram(phone: str) -> str:
    """Format phone as a WhatsApp link using the number as link text."""
    original_text = phone.strip()
    if not original_text:
        return ""

    def part_block(display: str, digits_source: str) -> str:
        url = _phone_to_whatsapp_url(digits_source)
        safe_display = html.escape(display)
        if url:
            safe_url = html.escape(url, quote=True)
            return f'<a href="{safe_url}">{safe_display}</a>'
        return safe_display

    if "+" in original_text:
        parts = original_text.split("+")
        blocks: list[str] = []
        for index, part in enumerate(parts):
            part = part.strip()
            if not part:
                continue
            display = f"+{part}" if index > 0 else part
            blocks.append(part_block(display, part))
        return "\n".join(blocks)

    return part_block(original_text, original_text)


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
        lines.append(f"<b>Phone:</b> {_format_phone_line_for_telegram(phone)}")
    email = _customer_email(order)
    if email:
        lines.append(f"<b>Email:</b> {html.escape(email)}")

    items_text = format_order_items_for_telegram(order)
    if items_text:
        lines.extend(["", "<b>Items:</b>", items_text])

    delivery_fee = order.delivery_fee
    if delivery_fee is not None:
        if delivery_fee == 0:
            lines.append("<b>Delivery:</b> Free")
        else:
            delivery_price = format_money(delivery_fee)
            if delivery_price:
                lines.append(f"<b>Delivery:</b> {html.escape(delivery_price)}")

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

    created = _format_created_at(order)
    if created:
        lines.append(f"<b>Created:</b> {html.escape(created)}")

    admin_url = _admin_order_url(order)
    if admin_url:
        safe_url = html.escape(admin_url, quote=True)
        lines.extend(["", f'<a href="{safe_url}">Open in Django admin</a>'])

    return "\n".join(lines)
