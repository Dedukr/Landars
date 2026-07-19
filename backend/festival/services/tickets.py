from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from festival.models import FestivalCreditNote, FestivalInvoice, FestivalOrder
from festival.services.pricing import money

LONDON = ZoneInfo("Europe/London")
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _columns() -> int:
    return int(getattr(settings, "FESTIVAL_TICKET_COLUMNS", 48))


def _max_bytes() -> int:
    return int(getattr(settings, "FESTIVAL_TICKET_MAX_BYTES", 32768))


def sanitize_text(value: str) -> str:
    text = CONTROL_CHARS.sub("", value or "")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _center(text: str, width: int) -> str:
    text = text[:width]
    pad = max(0, width - len(text))
    left = pad // 2
    return (" " * left) + text + (" " * (pad - left))


def _rule(width: int, char: str = "-") -> str:
    return char * width


def _money(value: Decimal | str) -> str:
    return f"£{money(value):.2f}"


def _wrap_words(text: str, width: int) -> list[str]:
    text = sanitize_text(text).strip()
    if not text:
        return [""]
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        while len(word) > width:
            if current:
                lines.append(current)
                current = ""
            lines.append(word[:width])
            word = word[width:]
        candidate = f"{current} {word}".strip() if current else word
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _qty_name_line(quantity: int, name: str, width: int) -> list[str]:
    prefix = f"{quantity} x "
    avail = max(8, width - len(prefix))
    wrapped = _wrap_words(name, avail)
    lines = [f"{prefix}{wrapped[0]}"]
    indent = " " * len(prefix)
    for part in wrapped[1:]:
        lines.append(f"{indent}{part}")
    return [line[:width] for line in lines]


def _qty_name_price_line(
    quantity: int, name: str, line_total: Decimal, width: int
) -> list[str]:
    price = _money(line_total)
    right = f" {price}"
    avail = max(8, width - len(right))
    body_lines = _qty_name_line(quantity, name, avail)
    first = body_lines[0]
    pad = max(1, avail - len(first))
    lines = [f"{first}{' ' * pad}{price}".rstrip()]
    for extra in body_lines[1:]:
        lines.append(extra[:width])
    return [line[:width] for line in lines]


def _local_dt(dt: datetime | None = None) -> datetime:
    value = dt or timezone.now()
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value.astimezone(LONDON)


def _finalize(lines: list[str]) -> str:
    width = _columns()
    cleaned = [sanitize_text(line)[:width] for line in lines]
    text = "\n".join(cleaned)
    if not text.endswith("\n"):
        text += "\n"
    encoded = text.encode("utf-8")
    if len(encoded) > _max_bytes():
        raise ValueError(
            f"Ticket payload exceeds FESTIVAL_TICKET_MAX_BYTES ({_max_bytes()})."
        )
    return text


def _seller_lines(seller: dict, width: int) -> list[str]:
    lines: list[str] = []
    for key in ("name", "address", "city", "postal_code", "country"):
        value = (seller or {}).get(key) or ""
        if value:
            lines.extend(_wrap_words(str(value), width))
    return lines


def render_kitchen_ticket(
    order: FestivalOrder, *, is_copy: bool = False
) -> str:
    width = _columns()
    created = _local_dt(order.created_at)
    lines = [
        _center("KITCHEN", width),
        _rule(width, "="),
    ]
    if is_copy:
        lines += [_center("*** COPY ***", width), _rule(width)]
    lines += [
        _center(f"TICKET {order.order_number}", width),
        _center(f"REF {order.pk}", width),
        _rule(width),
        created.strftime("%d/%m/%Y %H:%M"),
        _rule(width),
    ]
    for item in order.items.all():
        lines.extend(_qty_name_line(item.quantity, item.product_name, width))
    lines += [
        _rule(width, "="),
        _center(f"TICKET {order.order_number}", width),
    ]
    return _finalize(lines)


def render_customer_ticket(
    order: FestivalOrder,
    invoice: FestivalInvoice,
    *,
    is_copy: bool = False,
) -> str:
    width = _columns()
    created = _local_dt(invoice.issued_at)
    vat_registered = bool(getattr(settings, "FESTIVAL_VAT_REGISTERED", False))
    lines = [
        _center("CUSTOMER COPY", width),
        _center("PAID", width),
        _rule(width, "="),
    ]
    if is_copy:
        lines += [_center("*** COPY ***", width), _rule(width)]
    lines += [
        _center(f"TICKET {order.order_number}", width),
        f"REF {order.pk}",
        f"Invoice {invoice.invoice_number}",
        f"Tax point {created.strftime('%d/%m/%Y %H:%M')}",
        _rule(width),
    ]
    for item in order.items.all():
        lines.extend(
            _qty_name_price_line(
                item.quantity, item.product_name, item.line_total, width
            )
        )
    lines += [
        _rule(width),
        f"{'TOTAL':<{width - 12}}{_money(invoice.total_gross):>12}",
    ]
    if invoice.vat_breakdown:
        lines.append(_rule(width))
        if vat_registered:
            lines.append("VAT summary")
        else:
            lines.append("Tax summary")
        for rate, bucket in invoice.vat_breakdown.items():
            lines.append(
                f"VAT {rate}%  net {_money(bucket['net'])}  "
                f"vat {_money(bucket['vat'])}"
            )
    lines.append(_rule(width))
    lines.extend(_seller_lines(invoice.seller_snapshot, width))
    if vat_registered:
        vat_number = (
            (invoice.seller_snapshot or {}).get("vat_number")
            or (getattr(settings, "BUSINESS_INFO", {}) or {}).get("tax_code", "")
            or ""
        )
        if vat_number:
            lines.append(f"VAT No {vat_number}")
    lines += [
        _rule(width, "="),
        _center(f"TICKET {order.order_number}", width),
    ]
    return _finalize(lines)


def render_cancellation_kitchen_ticket(
    order: FestivalOrder, *, reason: str = "", is_copy: bool = False
) -> str:
    width = _columns()
    cancelled = _local_dt(order.cancelled_at or timezone.now())
    lines = [
        _rule(width, "*"),
        _center("CANCEL ORDER", width),
        _rule(width, "*"),
    ]
    if is_copy:
        lines += [_center("*** COPY ***", width), _rule(width)]
    lines += [
        _center(f"TICKET {order.order_number}", width),
        _center(f"REF {order.pk}", width),
        cancelled.strftime("%d/%m/%Y %H:%M"),
    ]
    if reason:
        lines.append(_rule(width))
        lines.extend(_wrap_words(f"Reason: {reason}", width))
    lines.append(_rule(width))
    for item in order.items.all():
        lines.extend(_qty_name_line(item.quantity, item.product_name, width))
    lines += [
        _rule(width, "*"),
        _center(f"TICKET {order.order_number}", width),
    ]
    return _finalize(lines)


def render_customer_credit_ticket(
    order: FestivalOrder,
    credit_note: FestivalCreditNote,
    *,
    is_copy: bool = False,
) -> str:
    width = _columns()
    issued = _local_dt(credit_note.issued_at)
    lines = [
        _center("CREDIT / REFUND", width),
        _rule(width, "="),
    ]
    if is_copy:
        lines += [_center("*** COPY ***", width), _rule(width)]
    lines += [
        f"Credit {credit_note.credit_note_number}",
        f"Original invoice {credit_note.original_invoice_number}",
        f"REF {order.pk}",
        issued.strftime("%d/%m/%Y %H:%M"),
    ]
    if credit_note.reason:
        lines.append(_rule(width))
        lines.extend(_wrap_words(f"Reason: {credit_note.reason}", width))
    lines.append(_rule(width))
    for item in order.items.all():
        lines.extend(
            _qty_name_price_line(
                item.quantity, item.product_name, item.line_total, width
            )
        )
    lines += [
        _rule(width),
        f"{'CREDITED TOTAL':<{width - 12}}{_money(credit_note.total_gross):>12}",
    ]
    if credit_note.vat_breakdown:
        lines.append(_rule(width))
        for rate, bucket in credit_note.vat_breakdown.items():
            lines.append(
                f"VAT {rate}%  net {_money(bucket['net'])}  "
                f"vat {_money(bucket['vat'])}"
            )
    lines.append(_rule(width))
    lines.extend(_seller_lines(credit_note.seller_snapshot, width))
    lines.append(_rule(width, "="))
    return _finalize(lines)
