from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

from festival.models import FestivalCreditNote, FestivalInvoice, FestivalOrder, FestivalOrderItem
from festival.services.pricing import money

LONDON = ZoneInfo("Europe/London")
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

# 76mm printable width ≈ 42 columns at Star Font A (~1.5mm/char).
# Leave a small margin vs a hard 48-col 80mm layout.
DEFAULT_TICKET_COLUMNS = 42


def _columns() -> int:
    return int(getattr(settings, "FESTIVAL_TICKET_COLUMNS", DEFAULT_TICKET_COLUMNS))


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
    """
    Format money with a pound sign.

    Stored as Unicode U+00A3 in ``payload_text``. CloudPRNT GET encodes the
    job as CP437 (see ``encode_print_payload``) so the printer's default
    code page prints a real £ instead of UTF-8 mojibake.
    """
    return f"£{money(value):.2f}"


def encode_print_payload(text: str) -> bytes:
    """
    Encode ticket text for CloudPRNT ``text/plain`` download.

    Star prints text/plain with the device default code page (``std``), not
    as UTF-8 — even when Content-Type says charset=utf-8. CP437 maps £ to
    a single byte (0x9C) that TSP100IV / Star thermal fonts render correctly.
    Override with ``FESTIVAL_TICKET_ENCODING`` (e.g. ``utf-8``) if needed.
    """
    encoding = (
        getattr(settings, "FESTIVAL_TICKET_ENCODING", None) or "cp437"
    ).strip().lower()
    if encoding in ("utf-8", "utf8"):
        return text.encode("utf-8")
    try:
        return text.encode(encoding, errors="replace")
    except LookupError:
        return text.encode("cp437", errors="replace")


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


def _product_label(item: FestivalOrderItem) -> str:
    """Product (+ filling); addition is rendered on its own line."""
    name = item.product_name or ""
    if item.filling_name:
        name = f"{name} ({item.filling_name})"
    return name


def _addition_label(item: FestivalOrderItem) -> str:
    if not item.addition_name:
        return ""
    return f"+ {item.addition_name}"


# Extra indent so additions read as nested under the meal name, not a peer line.
_ADDITION_TAB = "    "


def _amount_line(label: str, amount: Decimal | str, width: int) -> str:
    """Right-align amount on the same line as label; never overflow width."""
    price = _money(amount)
    gap = width - len(label) - len(price)
    if gap < 1:
        # Prefer keeping the amount intact on the next line.
        return f"{label[:width]}\n{price[:width]}"
    return f"{label}{' ' * gap}{price}"


def _qty_item_lines(
    quantity: int,
    item: FestivalOrderItem,
    width: int,
    *,
    line_total: Decimal | None = None,
) -> list[str]:
    """
    Item block::

        1 x Deep Fried Pelmeni          £9.99
            + Sparkling water
    """
    prefix = f"{quantity} x "
    indent = " " * len(prefix)
    addition_indent = indent + _ADDITION_TAB
    product = _product_label(item)
    addition = _addition_label(item)
    lines: list[str] = []

    if line_total is None:
        avail = max(8, width - len(prefix))
        wrapped = _wrap_words(product, avail)
        lines.append(f"{prefix}{wrapped[0]}"[:width])
        for part in wrapped[1:]:
            lines.append(f"{indent}{part}"[:width])
    else:
        price = _money(line_total)
        # Reserve space for " £9.99" on the first product line.
        right = f" {price}"
        avail = max(8, width - len(prefix) - len(right))
        wrapped = _wrap_words(product, avail)
        first = f"{prefix}{wrapped[0]}"
        pad = max(1, width - len(first) - len(price))
        lines.append(f"{first}{' ' * pad}{price}"[:width])
        for part in wrapped[1:]:
            lines.append(f"{indent}{part}"[:width])

    if addition:
        add_avail = max(8, width - len(addition_indent))
        for part in _wrap_words(addition, add_avail):
            lines.append(f"{addition_indent}{part}"[:width])

    return lines


def _local_dt(dt: datetime | None = None) -> datetime:
    value = dt or timezone.now()
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value.astimezone(LONDON)


def _finalize(lines: list[str]) -> str:
    width = _columns()
    cleaned: list[str] = []
    for line in lines:
        # Allow helpers to emit an intentional newline (e.g. overflowed totals).
        for part in sanitize_text(line).split("\n"):
            cleaned.append(part[:width])
    text = "\n".join(cleaned)
    if not text.endswith("\n"):
        text += "\n"
    encoded = text.encode("utf-8")
    if len(encoded) > _max_bytes():
        raise ValueError(
            f"Ticket payload exceeds FESTIVAL_TICKET_MAX_BYTES ({_max_bytes()})."
        )
    return text


def _spread_line(left: str, right: str, width: int) -> str:
    """Put ``left`` at the start and ``right`` at the end of one line."""
    left = left[:width]
    right = right[:width]
    gap = width - len(left) - len(right)
    if gap < 1:
        return f"{left}\n{right}"
    return f"{left}{' ' * gap}{right}"


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
        _rule(width),
        _spread_line(
            created.strftime("%d/%m/%Y %H:%M"),
            f"REF {order.pk}",
            width,
        ),
        _rule(width),
    ]
    for item in order.items.all():
        lines.extend(_qty_item_lines(item.quantity, item, width))
    lines.append(_rule(width, "="))
    return _finalize(lines)


def render_customer_ticket(
    order: FestivalOrder,
    invoice: FestivalInvoice | None = None,
    *,
    is_copy: bool = False,
) -> str:
    width = _columns()
    issued_at = invoice.issued_at if invoice is not None else order.created_at
    created = _local_dt(issued_at)
    vat_registered = bool(getattr(settings, "FESTIVAL_VAT_REGISTERED", False))
    if invoice is not None:
        total_gross = invoice.total_gross
        vat_breakdown = invoice.vat_breakdown or {}
        seller = invoice.seller_snapshot or {}
    else:
        from festival.services.documents import seller_snapshot
        from festival.services.documents import pricing_from_order

        pricing = pricing_from_order(order)
        total_gross = pricing.total_gross
        vat_breakdown = pricing.vat_breakdown or {}
        seller = seller_snapshot()

    lines = [
        _center("INVOICE", width),
        _rule(width, "="),
    ]
    if is_copy:
        lines += [_center("*** COPY ***", width), _rule(width)]
    lines += [
        _center(f"TICKET {order.order_number}", width),
    ]
    if invoice is not None:
        lines.append(f"Invoice {invoice.invoice_number}")
    lines += [
        created.strftime("%d/%m/%Y %H:%M"),
        _rule(width),
    ]
    for item in order.items.all():
        lines.extend(
            _qty_item_lines(
                item.quantity, item, width, line_total=item.line_total
            )
        )
    lines += [
        _rule(width),
        _amount_line("TOTAL", total_gross, width),
    ]
    if vat_breakdown:
        lines.append(_rule(width))
        if vat_registered:
            lines.append("VAT summary")
        else:
            lines.append("Tax summary")
        for rate, bucket in vat_breakdown.items():
            vat_line = (
                f"VAT {rate}%  net {_money(bucket['net'])}  "
                f"vat {_money(bucket['vat'])}"
            )
            lines.extend(_wrap_words(vat_line, width))
    lines.append(_rule(width))
    lines.extend(_seller_lines(seller, width))
    if vat_registered:
        vat_number = (
            seller.get("vat_number")
            or (getattr(settings, "BUSINESS_INFO", {}) or {}).get("tax_code", "")
            or ""
        )
        if vat_number:
            lines.append(f"VAT No {vat_number}")
    lines.append(_rule(width, "="))
    return _finalize(lines)


def render_test_ticket(printer) -> str:
    """Manual test page queued from the printer admin."""
    width = _columns()
    now = _local_dt()
    lines = [
        _center("TEST PAGE", width),
        _rule(width, "="),
        _center(printer.name, width),
        _rule(width),
        now.strftime("%d/%m/%Y %H:%M:%S"),
        _rule(width),
        "Characters: ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "            abcdefghijklmnopqrstuvwxyz",
        "Digits:     0123456789",
        f"Currency:   {_money(Decimal('12.34'))}",
        _rule(width),
        _center("If you can read this,", width),
        _center("CloudPRNT printing works.", width),
        _rule(width, "="),
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
        lines.extend(_qty_item_lines(item.quantity, item, width))
    lines.append(_rule(width, "*"))
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
            _qty_item_lines(
                item.quantity, item, width, line_total=item.line_total
            )
        )
    lines += [
        _rule(width),
        _amount_line("CREDITED TOTAL", credit_note.total_gross, width),
    ]
    if credit_note.vat_breakdown:
        lines.append(_rule(width))
        for rate, bucket in credit_note.vat_breakdown.items():
            vat_line = (
                f"VAT {rate}%  net {_money(bucket['net'])}  "
                f"vat {_money(bucket['vat'])}"
            )
            lines.extend(_wrap_words(vat_line, width))
    lines.append(_rule(width))
    lines.extend(_seller_lines(credit_note.seller_snapshot, width))
    lines.append(_rule(width, "="))
    return _finalize(lines)
