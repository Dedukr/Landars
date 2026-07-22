from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

from billing.models import get_s3_client, upload_file_to_s3
from festival.models import FestivalCreditNote, FestivalInvoice
from festival.services.numbering import (
    allocate_credit_note_number,
    allocate_invoice_number,
)
from festival.services.pricing import OrderPricing

logger = logging.getLogger(__name__)


def seller_snapshot() -> dict:
    business = dict(getattr(settings, "BUSINESS_INFO", {}) or {})
    if getattr(settings, "FESTIVAL_VAT_REGISTERED", False):
        # Same VAT/tax number as the main invoice & credit-note system.
        business["vat_number"] = business.get("tax_code", "") or ""
        business["vat_registered"] = True
    else:
        business["vat_registered"] = False
        business.pop("vat_number", None)
    return business


def create_paid_invoice(*, order, pricing: OrderPricing) -> FestivalInvoice:
    return FestivalInvoice.objects.create(
        order=order,
        invoice_number=allocate_invoice_number(),
        status=FestivalInvoice.Status.PAID,
        issued_at=timezone.now(),
        subtotal_net=pricing.subtotal_net,
        vat_total=pricing.vat_total,
        total_gross=pricing.total_gross,
        seller_snapshot=seller_snapshot(),
        vat_breakdown=pricing.vat_breakdown,
    )


def create_credit_note_from_invoice(
    *, invoice: FestivalInvoice, reason: str = ""
) -> FestivalCreditNote:
    return FestivalCreditNote.objects.create(
        invoice=invoice,
        credit_note_number=allocate_credit_note_number(),
        issued_at=timezone.now(),
        reason=reason or "",
        original_invoice_number=invoice.invoice_number,
        subtotal_net=invoice.subtotal_net,
        vat_total=invoice.vat_total,
        total_gross=invoice.total_gross,
        seller_snapshot=dict(invoice.seller_snapshot or {}),
        vat_breakdown=dict(invoice.vat_breakdown or {}),
    )


def _render_pdf(template_name: str, context: dict) -> bytes:
    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration

    html_string = render_to_string(template_name, context)
    cache_dir = Path("/tmp/weasyprint_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    font_config = FontConfiguration()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp_path = tmp.name
    try:
        HTML(string=html_string, base_url=settings.URL_BASE).write_pdf(
            target=tmp_path,
            font_config=font_config,
            optimize_images=True,
            jpeg_quality=85,
            dpi=150,
            cache=cache_dir,
        )
        with open(tmp_path, "rb") as fh:
            data = fh.read()
        if not data:
            raise ValueError("PDF generation produced empty output.")
        return data
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass


def generate_invoice_pdf(invoice: FestivalInvoice) -> str:
    """Generate and upload invoice PDF idempotently. Returns S3 key."""
    if invoice.pdf_key:
        return invoice.pdf_key

    pdf_bytes = _render_pdf(
        "festival/invoice.html",
        {
            "invoice": invoice,
            "order": invoice.order,
            "items": invoice.order.items.all(),
            "business": invoice.seller_snapshot,
            "vat_registered": bool(
                (invoice.seller_snapshot or {}).get("vat_registered")
            ),
        },
    )
    s3_key = f"festival/invoices/{invoice.invoice_number}.pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name
    try:
        upload_file_to_s3(tmp_path, s3_key)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    # Idempotent under concurrency: only set if still empty.
    updated = FestivalInvoice.objects.filter(pk=invoice.pk, pdf_key="").update(
        pdf_key=s3_key
    )
    if updated:
        invoice.pdf_key = s3_key
    else:
        invoice.refresh_from_db(fields=["pdf_key"])
    return invoice.pdf_key


def generate_credit_note_pdf(credit_note: FestivalCreditNote) -> str:
    if credit_note.pdf_key:
        return credit_note.pdf_key

    order = credit_note.invoice.order
    pdf_bytes = _render_pdf(
        "festival/credit_note.html",
        {
            "credit_note": credit_note,
            "invoice": credit_note.invoice,
            "order": order,
            "items": order.items.all(),
            "business": credit_note.seller_snapshot,
            "vat_registered": bool(
                (credit_note.seller_snapshot or {}).get("vat_registered")
            ),
        },
    )
    s3_key = f"festival/credit_notes/{credit_note.credit_note_number}.pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name
    try:
        upload_file_to_s3(tmp_path, s3_key)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    updated = FestivalCreditNote.objects.filter(
        pk=credit_note.pk, pdf_key=""
    ).update(pdf_key=s3_key)
    if updated:
        credit_note.pdf_key = s3_key
    else:
        credit_note.refresh_from_db(fields=["pdf_key"])
    return credit_note.pdf_key


def get_presigned_pdf_url(s3_key: str, *, expires_in: int = 300) -> str:
    if not s3_key:
        raise ValueError("No PDF key.")
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
            "Key": s3_key,
        },
        ExpiresIn=expires_in,
    )
