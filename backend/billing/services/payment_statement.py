"""
Paid-orders Payment Statement: query, DTO assembly, PDF and CSV rendering.

Authoritative money values come from Invoice / CreditNote snapshots.
Payment timing uses Invoice.paid_at (and CreditNote.created_at for adjustments).
No Stripe API calls; processing fees are omitted when not persisted locally.
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Iterable
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import F, Prefetch
from django.template.loader import render_to_string
from django.utils import timezone

from billing.models import CreditNote, Invoice, InvoiceLineItem

logger = logging.getLogger(__name__)

MONEY_QUANT = Decimal("0.01")
ZERO = Decimal("0.00")


class PaymentStatementError(ValueError):
    """Raised for validation / empty-result cases (safe to show in admin)."""


@dataclass(frozen=True)
class StatementRow:
    """One payment or credit-note adjustment line for the statement."""

    payment_date: date
    order_reference: str
    invoice_number: str
    customer: str
    customer_business_name: str
    payment_method: str
    transaction_reference: str
    net_amount: Decimal
    vat_amount: Decimal
    gross_amount: Decimal
    vat_rate_label: str
    order_date: date | None
    row_kind: str  # "payment" | "credit_note"
    notes: str = ""
    # Pre-formatted for templates (no calculation in templates).
    payment_date_display: str = ""
    order_date_display: str = ""
    net_display: str = ""
    vat_display: str = ""
    gross_display: str = ""

    def __post_init__(self):
        # Dataclass frozen: use object.__setattr__ for derived display fields
        # when callers omit them (tests / internal construction).
        if not self.payment_date_display:
            object.__setattr__(
                self,
                "payment_date_display",
                format_statement_date(self.payment_date),
            )
        if self.order_date and not self.order_date_display:
            object.__setattr__(
                self,
                "order_date_display",
                format_statement_date(self.order_date),
            )
        if not self.net_display:
            object.__setattr__(self, "net_display", format_gbp(self.net_amount))
        if not self.vat_display:
            object.__setattr__(self, "vat_display", format_gbp(self.vat_amount))
        if not self.gross_display:
            object.__setattr__(self, "gross_display", format_gbp(self.gross_amount))


@dataclass(frozen=True)
class VatRateSummary:
    vat_rate_label: str
    net_amount: Decimal
    vat_amount: Decimal
    gross_amount: Decimal
    net_display: str = ""
    vat_display: str = ""
    gross_display: str = ""

    def __post_init__(self):
        if not self.net_display:
            object.__setattr__(self, "net_display", format_gbp(self.net_amount))
        if not self.vat_display:
            object.__setattr__(self, "vat_display", format_gbp(self.vat_amount))
        if not self.gross_display:
            object.__setattr__(self, "gross_display", format_gbp(self.gross_amount))


@dataclass(frozen=True)
class PaymentMethodSummary:
    payment_method: str
    count: int
    gross_amount: Decimal
    gross_display: str = ""

    def __post_init__(self):
        if not self.gross_display:
            object.__setattr__(self, "gross_display", format_gbp(self.gross_amount))


@dataclass
class PaymentStatement:
    """Prepared statement dataset for PDF / CSV renderers."""

    from_date: date
    to_date: date
    period_display: str
    generated_at: datetime
    generated_at_display: str
    currency: str
    company: dict
    rows: list[StatementRow] = field(default_factory=list)
    total_net: Decimal = ZERO
    total_vat: Decimal = ZERO
    total_gross: Decimal = ZERO
    paid_transaction_count: int = 0
    total_net_display: str = ""
    total_vat_display: str = ""
    total_gross_display: str = ""
    vat_summaries: list[VatRateSummary] = field(default_factory=list)
    payment_method_summaries: list[PaymentMethodSummary] = field(default_factory=list)
    reference: str = ""


def format_gbp(amount: Decimal) -> str:
    """Format a Decimal as £X.XX (handles negatives for credit notes)."""
    quantised = Decimal(amount).quantize(MONEY_QUANT)
    if quantised < 0:
        return f"-£{abs(quantised):,.2f}"
    return f"£{quantised:,.2f}"


def format_statement_date(value: date) -> str:
    """Human date like '1 September 2026' (no leading zero on day)."""
    return f"{value.day} {value.strftime('%B %Y')}"


def format_period(from_date: date, to_date: date) -> str:
    return f"{format_statement_date(from_date)} – {format_statement_date(to_date)}"


def business_timezone() -> ZoneInfo:
    tz_name = getattr(settings, "TIME_ZONE", "Europe/London") or "Europe/London"
    return ZoneInfo(tz_name)


def inclusive_date_range_bounds(
    from_date: date, to_date: date
) -> tuple[datetime, datetime]:
    """
    Inclusive calendar dates in the business timezone as a half-open datetime range:
    ``>= start_of_from_date`` AND ``< start_of_day_after_to_date``.
    """
    if from_date > to_date:
        raise PaymentStatementError("'From' date must be on or before 'To' date.")
    tz = business_timezone()
    start = datetime.combine(from_date, time.min, tzinfo=tz)
    end_exclusive = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=tz)
    return start, end_exclusive


def quantise_money(value: Decimal | int | str | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_QUANT)


def _customer_name(invoice: Invoice) -> str:
    snap = invoice.customer_snapshot or {}
    name = (snap.get("name") or "").strip()
    if name:
        return name
    parts = [snap.get("first_name") or "", snap.get("surname") or ""]
    joined = " ".join(p for p in parts if p).strip()
    if joined:
        return joined
    email = (snap.get("email") or "").strip()
    return email or "—"


def _business_name(invoice: Invoice) -> str:
    billing = invoice.billing_address_snapshot or {}
    return (billing.get("company_name") or "").strip()


def _invoice_number_display(invoice: Invoice) -> str:
    if getattr(invoice, "display_invoice_number", None):
        return invoice.display_invoice_number
    num = invoice.invoice_number or 0
    return f"LF-{int(num):06d}"


def _order_reference(invoice: Invoice) -> str:
    order_id = invoice.order_id
    if order_id:
        return f"Order #{order_id}"
    return "—"


def _order_date(invoice: Invoice) -> date | None:
    order = getattr(invoice, "order", None)
    if order is None or not getattr(order, "created_at", None):
        return None
    return timezone.localtime(order.created_at).date()


def _payment_method(invoice: Invoice) -> str:
    if invoice.stripe_payment_intent_id or invoice.stripe_checkout_session_id:
        return "Pay by Bank (Stripe)"
    order = getattr(invoice, "order", None)
    if order is not None:
        if order.payment_intent_id and order.payment_status == "succeeded":
            return "Card (Stripe)"
        if order.payment_intent_id:
            return "Stripe"
        if order.source == "frontend" and order.payment_status == "succeeded":
            return "Card (Stripe)"
    return "Manual"


def _transaction_reference(invoice: Invoice) -> str:
    if invoice.stripe_payment_intent_id:
        return invoice.stripe_payment_intent_id
    if invoice.stripe_checkout_session_id:
        return invoice.stripe_checkout_session_id
    order = getattr(invoice, "order", None)
    if order is not None and order.payment_intent_id:
        return order.payment_intent_id
    return ""


def _vat_rate_label_for_invoice(invoice: Invoice) -> str:
    rates = sorted(
        {
            (line.vat_rate or ZERO).quantize(Decimal("0.0001"))
            for line in invoice.line_items.all()
        }
    )
    if not rates:
        return "—"
    if len(rates) == 1:
        pct = (rates[0] * Decimal("100")).quantize(Decimal("1"))
        return f"{pct}%"
    labels = []
    for rate in rates:
        pct = (rate * Decimal("100")).quantize(Decimal("1"))
        labels.append(f"{pct}%")
    return ", ".join(labels)


def _money_triplet(gross: Decimal, vat: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    """Return (net, vat, gross) with net = gross - vat, all quantised."""
    gross_q = quantise_money(gross)
    vat_q = quantise_money(vat)
    net_q = quantise_money(gross_q - vat_q)
    if net_q + vat_q != gross_q:
        # Guard against pathological snapshot drift; prefer stored gross/vat.
        net_q = quantise_money(gross_q - vat_q)
    return net_q, vat_q, gross_q


def query_paid_invoices(range_start: datetime, range_end_exclusive: datetime):
    """
    Fully paid invoices whose payment completion time falls in the half-open range.

    Includes invoices later voided by a credit note (``paid_at`` and full
    ``amount_paid`` are retained). Excludes unpaid / part-paid / never-paid voids.
    """
    return (
        Invoice.objects.filter(
            paid_at__gte=range_start,
            paid_at__lt=range_end_exclusive,
            paid_at__isnull=False,
            amount_paid__gte=F("total_amount"),
        )
        .select_related("order", "order__customer")
        .prefetch_related(
            Prefetch(
                "line_items",
                queryset=InvoiceLineItem.objects.only(
                    "id", "invoice_id", "vat_rate", "vat_amount", "line_total", "promo_discount"
                ),
            ),
            "credit_note",
        )
        .order_by("paid_at", "invoice_number")
    )


def query_credit_notes_in_range(range_start: datetime, range_end_exclusive: datetime):
    """
    Credit notes issued in range for invoices that had been fully paid.

    Emitted as negative adjustment rows so revenue is not overstated when
    a paid invoice is later credited.
    """
    return (
        CreditNote.objects.filter(
            created_at__gte=range_start,
            created_at__lt=range_end_exclusive,
            invoice__paid_at__isnull=False,
            invoice__amount_paid__gte=F("invoice__total_amount"),
        )
        .select_related("invoice", "invoice__order", "invoice__order__customer")
        .prefetch_related("line_items", "invoice__line_items")
        .order_by("created_at", "credit_note_number")
    )


def _row_from_invoice(invoice: Invoice) -> StatementRow:
    net, vat, gross = _money_triplet(invoice.total_amount, invoice.vat_amount)
    paid_at = invoice.paid_at
    payment_date = timezone.localtime(paid_at).date() if paid_at else timezone.localdate()
    notes = ""
    if invoice.status == Invoice.Status.VOID:
        notes = "Subsequently credited / voided"
    try:
        cn = invoice.credit_note
        if cn is not None:
            notes = (
                f"Credited by CN-{int(cn.credit_note_number):06d}"
                if cn.credit_note_number
                else "Credited"
            )
    except CreditNote.DoesNotExist:
        pass

    return StatementRow(
        payment_date=payment_date,
        order_reference=_order_reference(invoice),
        invoice_number=_invoice_number_display(invoice),
        customer=_customer_name(invoice),
        customer_business_name=_business_name(invoice),
        payment_method=_payment_method(invoice),
        transaction_reference=_transaction_reference(invoice),
        net_amount=net,
        vat_amount=vat,
        gross_amount=gross,
        vat_rate_label=_vat_rate_label_for_invoice(invoice),
        order_date=_order_date(invoice),
        row_kind="payment",
        notes=notes,
    )


def _row_from_credit_note(credit_note: CreditNote) -> StatementRow:
    invoice = credit_note.invoice
    net, vat, gross = _money_triplet(credit_note.total_amount, credit_note.vat_amount)
    # Negative adjustment
    net, vat, gross = -net, -vat, -gross
    created = timezone.localtime(credit_note.created_at).date()
    cn_num = (
        f"CN-{int(credit_note.credit_note_number):06d}"
        if credit_note.credit_note_number is not None
        else "CN"
    )
    return StatementRow(
        payment_date=created,
        order_reference=_order_reference(invoice),
        invoice_number=_invoice_number_display(invoice),
        customer=_customer_name(invoice),
        customer_business_name=_business_name(invoice),
        payment_method="Credit note",
        transaction_reference=cn_num,
        net_amount=net,
        vat_amount=vat,
        gross_amount=gross,
        vat_rate_label=_vat_rate_label_for_invoice(invoice),
        order_date=_order_date(invoice),
        row_kind="credit_note",
        notes=f"Credit note {cn_num}",
    )


def _build_vat_summaries(invoices: Iterable[Invoice]) -> list[VatRateSummary]:
    """
    VAT summary by rate from payment-invoice line items.

    Document-level totals remain authoritative. Line-item rate buckets may not
    equal document Net/VAT/Gross because delivery, discounts and promos sit
    outside the per-line VAT base.
    """
    buckets: dict[Decimal, dict[str, Decimal]] = {}

    for inv in invoices:
        for line in inv.line_items.all():
            rate_q = (line.vat_rate or ZERO).quantize(Decimal("0.0001"))
            bucket = buckets.setdefault(
                rate_q, {"net": ZERO, "vat": ZERO, "gross": ZERO}
            )
            vat_q = quantise_money(line.vat_amount)
            gross_q = quantise_money(line.line_total)
            net_q = quantise_money(gross_q - vat_q)
            bucket["vat"] = quantise_money(bucket["vat"] + vat_q)
            bucket["gross"] = quantise_money(bucket["gross"] + gross_q)
            bucket["net"] = quantise_money(bucket["net"] + net_q)

    summaries: list[VatRateSummary] = []
    for rate in sorted(buckets.keys()):
        data = buckets[rate]
        pct = (rate * Decimal("100")).quantize(Decimal("1"))
        summaries.append(
            VatRateSummary(
                vat_rate_label=f"{pct}%",
                net_amount=data["net"],
                vat_amount=data["vat"],
                gross_amount=data["gross"],
            )
        )
    return summaries


def _build_payment_method_summaries(rows: list[StatementRow]) -> list[PaymentMethodSummary]:
    counts: dict[str, dict[str, Decimal | int]] = {}
    for row in rows:
        if row.row_kind != "payment":
            continue
        entry = counts.setdefault(row.payment_method, {"count": 0, "gross": ZERO})
        entry["count"] = int(entry["count"]) + 1
        entry["gross"] = quantise_money(Decimal(str(entry["gross"])) + row.gross_amount)
    return [
        PaymentMethodSummary(
            payment_method=method,
            count=int(data["count"]),
            gross_amount=quantise_money(data["gross"]),
        )
        for method, data in sorted(counts.items(), key=lambda x: x[0])
    ]


def build_payment_statement(
    from_date: date,
    to_date: date,
    *,
    generated_at: datetime | None = None,
) -> PaymentStatement:
    """
    Build a PaymentStatement DTO for the inclusive date range.

    Raises PaymentStatementError for invalid ranges or zero matching transactions.
    """
    if from_date is None or to_date is None:
        raise PaymentStatementError("Both 'From' and 'To' dates are required.")

    range_start, range_end = inclusive_date_range_bounds(from_date, to_date)

    invoices = list(query_paid_invoices(range_start, range_end))
    credit_notes = list(query_credit_notes_in_range(range_start, range_end))

    rows: list[StatementRow] = [_row_from_invoice(inv) for inv in invoices]
    rows.extend(_row_from_credit_note(cn) for cn in credit_notes)

    # Chronological for the document (payments and credits interleaved by date).
    rows.sort(key=lambda r: (r.payment_date, r.row_kind != "payment", r.invoice_number))

    if not rows:
        raise PaymentStatementError(
            "No paid transactions found for the selected period."
        )

    total_net = quantise_money(sum((r.net_amount for r in rows), ZERO))
    total_vat = quantise_money(sum((r.vat_amount for r in rows), ZERO))
    total_gross = quantise_money(sum((r.gross_amount for r in rows), ZERO))
    if total_net + total_vat != total_gross:
        # Force identity using stored row values; recompute gross from net+vat
        # only if floating drift somehow appeared (should not with Decimal).
        total_gross = quantise_money(total_net + total_vat)

    paid_count = sum(1 for r in rows if r.row_kind == "payment")

    now = generated_at or timezone.now()
    local_now = timezone.localtime(now)

    company = dict(getattr(settings, "BUSINESS_INFO", {}) or {})
    # Prefer seller branding from the first payment invoice when available.
    for inv in invoices:
        if inv.seller_snapshot:
            company = dict(inv.seller_snapshot)
            break

    statement = PaymentStatement(
        from_date=from_date,
        to_date=to_date,
        period_display=format_period(from_date, to_date),
        generated_at=local_now,
        generated_at_display=local_now.strftime("%d %B %Y %H:%M %Z"),
        currency="GBP",
        company=company,
        rows=rows,
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        paid_transaction_count=paid_count,
        total_net_display=format_gbp(total_net),
        total_vat_display=format_gbp(total_vat),
        total_gross_display=format_gbp(total_gross),
        vat_summaries=_build_vat_summaries(invoices),
        payment_method_summaries=_build_payment_method_summaries(rows),
        reference=f"PS-{from_date.strftime('%Y%m%d')}-{to_date.strftime('%Y%m%d')}",
    )
    return statement


def render_payment_statement_html(statement: PaymentStatement) -> str:
    return render_to_string(
        "payment_statement.html",
        {
            "statement": statement,
            "business": statement.company,
        },
    )


def render_payment_statement_pdf(
    statement: PaymentStatement,
    *,
    base_url: str = "http://localhost/",
) -> bytes:
    """Render the statement HTML to PDF bytes via WeasyPrint (same stack as invoices)."""
    import gc
    from pathlib import Path

    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration

    html_string = render_payment_statement_html(statement)
    cache_dir = Path("/tmp/weasyprint_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    font_config = FontConfiguration()

    try:
        pdf_bytes = HTML(string=html_string, base_url=base_url).write_pdf(
            font_config=font_config,
            optimize_images=True,
            jpeg_quality=85,
            dpi=150,
            cache=cache_dir,
        )
    except Exception as exc:
        logger.exception("Payment statement PDF generation failed")
        raise PaymentStatementError(f"PDF generation failed: {exc}") from exc
    finally:
        del html_string, font_config
        gc.collect()

    if not pdf_bytes:
        raise PaymentStatementError("PDF generation failed (empty output).")
    return pdf_bytes


def render_payment_statement_csv(statement: PaymentStatement) -> bytes:
    """CSV export using the same StatementRow dataset as the PDF."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Payment Date",
            "Order Reference",
            "Invoice Number",
            "Customer",
            "Business Name",
            "Payment Method",
            "VAT Rate",
            "Net Amount",
            "VAT Amount",
            "Gross Amount",
            "Notes",
        ]
    )
    for row in statement.rows:
        writer.writerow(
            [
                row.payment_date.isoformat(),
                row.order_reference,
                row.invoice_number,
                row.customer,
                row.customer_business_name,
                row.payment_method,
                row.vat_rate_label,
                f"{row.net_amount.quantize(MONEY_QUANT)}",
                f"{row.vat_amount.quantize(MONEY_QUANT)}",
                f"{row.gross_amount.quantize(MONEY_QUANT)}",
                row.notes,
            ]
        )
    # UTF-8 BOM helps Excel recognise encoding for £ and names.
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")
