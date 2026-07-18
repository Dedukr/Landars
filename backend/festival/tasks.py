from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from festival.models import FestivalCreditNote, FestivalInvoice, FestivalPrintJob

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=5, default_retry_delay=60, ignore_result=True)
def generate_festival_invoice_pdf_task(self, invoice_id: int) -> str | None:
    from festival.services.documents import generate_invoice_pdf

    try:
        invoice = FestivalInvoice.objects.get(pk=invoice_id)
    except FestivalInvoice.DoesNotExist:
        logger.warning("Festival invoice %s missing for PDF task", invoice_id)
        return None
    try:
        return generate_invoice_pdf(invoice)
    except Exception as exc:
        logger.exception("Festival invoice PDF failed for %s", invoice_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=5, default_retry_delay=60, ignore_result=True)
def generate_festival_credit_note_pdf_task(self, credit_note_id: int) -> str | None:
    from festival.services.documents import generate_credit_note_pdf

    try:
        credit_note = FestivalCreditNote.objects.get(pk=credit_note_id)
    except FestivalCreditNote.DoesNotExist:
        logger.warning("Festival credit note %s missing for PDF task", credit_note_id)
        return None
    try:
        return generate_credit_note_pdf(credit_note)
    except Exception as exc:
        logger.exception("Festival credit-note PDF failed for %s", credit_note_id)
        raise self.retry(exc=exc)


@shared_task(ignore_result=True)
def recover_stale_festival_print_claims() -> dict | None:
    """
    Observe stale CLAIMED jobs. Re-delivery of the same claimed job is preferred
    over advancing the queue; this task only logs/alerts and does not auto-fail
    within the CloudPRNT acknowledgement window.
    """
    stale_minutes = 10
    cutoff = timezone.now() - timedelta(minutes=stale_minutes)
    count = FestivalPrintJob.objects.filter(
        status=FestivalPrintJob.Status.CLAIMED,
        claimed_at__lt=cutoff,
    ).count()
    if not count:
        return None
    logger.warning("Found %s stale CLAIMED festival print jobs", count)
    return {"stale_claimed": count}


@shared_task(ignore_result=True)
def report_missing_festival_document_pdfs() -> dict | None:
    missing_invoices = FestivalInvoice.objects.filter(pdf_key="").count()
    missing_credits = FestivalCreditNote.objects.filter(pdf_key="").count()
    if not missing_invoices and not missing_credits:
        return None
    logger.warning(
        "Missing festival PDFs: invoices=%s credit_notes=%s",
        missing_invoices,
        missing_credits,
    )
    return {
        "missing_invoices": missing_invoices,
        "missing_credit_notes": missing_credits,
    }


@shared_task(ignore_result=True)
def cleanup_old_festival_ticket_payloads() -> int:
    """
    Clear payload_text for old PRINTED jobs while retaining checksums/metadata.
    Retention of accounting records is unaffected.
    """
    retention_days = 90
    cutoff = timezone.now() - timedelta(days=retention_days)
    qs = FestivalPrintJob.objects.filter(
        status=FestivalPrintJob.Status.PRINTED,
        completed_at__lt=cutoff,
    ).exclude(payload_text="")
    updated = 0
    for job in qs.iterator():
        job.payload_text = ""
        job.audit_note = (
            job.audit_note + "\n" if job.audit_note else ""
        ) + "Payload cleared after retention period."
        job.save(update_fields=["payload_text", "audit_note", "updated_at"])
        updated += 1
    if updated:
        logger.info("Cleared payload_text on %s old festival print jobs", updated)
    return updated
