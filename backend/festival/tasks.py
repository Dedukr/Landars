from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from festival.models import FestivalCreditNote, FestivalInvoice, FestivalPrintJob
from festival.services.cloudprnt import MAX_AUTO_RETRIES, MAX_STALE_CLAIM_REQUEUES

logger = logging.getLogger(__name__)

# Re-export for tests / callers that imported these from tasks.
__all__ = [
    "MAX_AUTO_RETRIES",
    "MAX_STALE_CLAIM_REQUEUES",
    "send_festival_alert_task",
    "generate_festival_invoice_pdf_task",
    "generate_festival_credit_note_pdf_task",
    "auto_retry_failed_festival_print_jobs",
    "recover_stale_festival_print_claims",
    "check_festival_printer_health",
    "verify_festival_order_prints",
    "report_missing_festival_document_pdfs",
    "cleanup_old_festival_ticket_payloads",
]


@shared_task(ignore_result=True)
def send_festival_alert_task(text: str, throttle_key: str) -> None:
    from festival.services.alerts import send_festival_alert

    send_festival_alert(text, throttle_key=throttle_key)


@shared_task(ignore_result=True)
def verify_festival_order_prints(order_id: int) -> dict | None:
    """
    After a short grace period, alert if this order's tickets are still
    unprinted (printer online or not). Skips tickets already covered by a
    prior unprinted alert (watermark).
    """
    from festival.services.alerts import (
        alert_unprinted_print_jobs,
        get_printer_offline_watermark,
    )
    from festival.services.cloudprnt import get_active_printer

    if getattr(settings, "FESTIVAL_PRINT_MODE", "disabled") != "cloudprnt":
        return None

    pending_jobs = list(
        FestivalPrintJob.objects.filter(
            order_id=order_id,
            status__in=[
                FestivalPrintJob.Status.READY,
                FestivalPrintJob.Status.CLAIMED,
            ],
        )
        .select_related("order", "printer")
        .order_by("created_at", "pk")
    )
    if not pending_jobs:
        return None

    watermark = get_printer_offline_watermark()
    if watermark is not None:
        pending_jobs = [j for j in pending_jobs if j.created_at > watermark]
    if not pending_jobs:
        return None

    printer = pending_jobs[0].printer or get_active_printer()
    if printer is None:
        return None

    sent = alert_unprinted_print_jobs(
        pending_jobs, printer=printer, require_offline=False
    )
    if sent:
        logger.warning(
            "Festival order %s still unprinted after verify window (%s jobs)",
            order_id,
            len(pending_jobs),
        )
    return {"order_id": order_id, "pending": len(pending_jobs), "alerted": sent}


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
def auto_retry_failed_festival_print_jobs() -> dict | None:
    """
    Create replacement jobs for FAILED tickets so a failure never blocks its
    batch indefinitely. Each payload is retried up to MAX_AUTO_RETRIES times;
    beyond that we alert and leave the job FAILED for manual handling.
    """
    from festival.services.alerts import send_festival_alert
    from festival.services.cloudprnt import (
        CloudPRNTError,
        create_retry_job,
        retry_chain_depth,
    )

    retried: list[str] = []
    exhausted: list[FestivalPrintJob] = []
    failed_jobs = (
        FestivalPrintJob.objects.filter(status=FestivalPrintJob.Status.FAILED)
        .select_related("order", "retry_of")
        .order_by("created_at")
    )
    for job in failed_jobs:
        if retry_chain_depth(job) >= MAX_AUTO_RETRIES:
            exhausted.append(job)
            continue
        try:
            replacement = create_retry_job(job)
        except CloudPRNTError as exc:
            logger.warning("Auto-retry skipped for %s: %s", job.job_token, exc)
            continue
        retried.append(str(replacement.job_token))
        logger.info(
            "Auto-retried festival print job %s -> %s",
            job.job_token,
            replacement.job_token,
        )

    for job in exhausted:
        if job.order_id is None:
            target = f"test page on printer '{job.printer.name}'"
        else:
            order_number = getattr(job.order, "order_number", job.order_id)
            target = f"order #{order_number}"
        send_festival_alert(
            (
                f"Print job for {target} ({job.job_type}) failed "
                f"{MAX_AUTO_RETRIES + 1} times and will NOT be retried "
                f"automatically.\nLast error: {job.last_error or 'unknown'}\n"
                "Retry it manually from the admin once the printer is fixed."
            ),
            throttle_key=f"retries-exhausted:{job.job_token}",
            throttle_seconds=3600,
        )

    if not retried and not exhausted:
        return None
    return {"retried": len(retried), "exhausted": len(exhausted)}


@shared_task(ignore_result=True)
def recover_stale_festival_print_claims() -> dict | None:
    """
    Auto-fix stale CLAIMED jobs. Unfetched claims stale after 3 minutes;
    fetched claims after 10 minutes (printer may still be printing).
    """
    from festival.services.alerts import (
        format_stuck_ticket_payloads,
        send_festival_alert,
    )
    from festival.services.cloudprnt import sync_print_batch

    now = timezone.now()
    unfetched_cutoff = now - timedelta(minutes=3)
    fetched_cutoff = now - timedelta(minutes=10)
    requeued = 0
    failed = 0
    with transaction.atomic():
        stale_jobs = list(
            FestivalPrintJob.objects.select_for_update(of=("self",))
            .filter(status=FestivalPrintJob.Status.CLAIMED)
            .filter(
                Q(fetched_at__isnull=True, claimed_at__lt=unfetched_cutoff)
                | Q(fetched_at__isnull=False, fetched_at__lt=fetched_cutoff)
            )
            .select_related("printer", "order")
            .order_by("claimed_at")
        )
        # Capture payloads before status changes (text itself is unchanged).
        # Telegram only for jobs hitting stale recovery for the first time —
        # repeated recoveries of the same claim are silent.
        alert_jobs = [job for job in stale_jobs if job.stale_requeue_count == 0]
        for job in stale_jobs:
            note = (
                f"Stale claim recovered at {now.isoformat()} "
                f"(claimed {job.claimed_at.isoformat() if job.claimed_at else '?'})."
            )
            job.audit_note = (job.audit_note + "\n" if job.audit_note else "") + note
            job.stale_requeue_count += 1
            if job.stale_requeue_count >= MAX_STALE_CLAIM_REQUEUES:
                job.status = FestivalPrintJob.Status.FAILED
                job.last_error = "Claimed repeatedly but never acknowledged."
                job.claimed_at = None
                job.fetched_at = None
                failed += 1
            else:
                job.status = FestivalPrintJob.Status.READY
                job.claimed_at = None
                job.fetched_at = None
                requeued += 1
            job.save(
                update_fields=[
                    "status",
                    "claimed_at",
                    "fetched_at",
                    "stale_requeue_count",
                    "last_error",
                    "audit_note",
                    "updated_at",
                ]
            )
            sync_print_batch(job.batch_uuid)
            printer = job.printer
            if printer.current_job_token == job.job_token:
                printer.current_job_token = None
                printer.save(update_fields=["current_job_token", "updated_at"])

    if not requeued and not failed:
        return None
    logger.warning(
        "Recovered stale CLAIMED festival print jobs: requeued=%s failed=%s",
        requeued,
        failed,
    )
    if alert_jobs:
        payloads = format_stuck_ticket_payloads(alert_jobs)
        body = (
            f"Recovered stale print jobs: {requeued} requeued, {failed} failed "
            f"({len(alert_jobs)} newly stale).\n"
            "The printer stopped acknowledging jobs — check it is powered on "
            "and connected."
        )
        if payloads:
            body = f"{body}\n\n{payloads}"
        send_festival_alert(
            body,
            throttle_key=f"stale-claims:{alert_jobs[0].job_token}",
            throttle_seconds=3600,
        )
    return {"requeued": requeued, "failed": failed}


@shared_task(ignore_result=True)
def check_festival_printer_health() -> dict | None:
    """
    Alert when tickets are queued but the printer has stopped polling
    (offline) so printing breaks are noticed without watching the admin.

    Alerts only when new unprinted jobs appear since the last offline alert
    (no periodic reminders while the same backlog sits there).
    """
    from festival.services.alerts import (
        advance_printer_offline_watermark,
        format_stuck_ticket_payloads,
        get_printer_offline_watermark,
        send_festival_alert,
    )
    from festival.services.cloudprnt import get_active_printer

    if getattr(settings, "FESTIVAL_PRINT_MODE", "disabled") != "cloudprnt":
        return None
    pending = FestivalPrintJob.objects.filter(
        status__in=[
            FestivalPrintJob.Status.READY,
            FestivalPrintJob.Status.CLAIMED,
        ]
    )
    pending_count = pending.count()
    if not pending_count:
        return None
    printer = get_active_printer()
    if printer and printer.is_online:
        return None

    watermark = get_printer_offline_watermark()
    new_qs = pending.select_related("order").order_by("created_at", "pk")
    if watermark is not None:
        new_qs = new_qs.filter(created_at__gt=watermark)
    new_jobs = list(new_qs)
    if not new_jobs:
        # Same stuck queue as last alert — do not nag Telegram again.
        return {"pending": pending_count}

    ready_count = pending.filter(status=FestivalPrintJob.Status.READY).count()
    claimed_count = pending_count - ready_count
    oldest = pending.order_by("created_at").first()
    waiting_minutes = (
        int((timezone.now() - oldest.created_at).total_seconds() // 60)
        if oldest
        else 0
    )
    if printer:
        last_seen = (
            printer.last_seen_at.strftime("%H:%M") if printer.last_seen_at else "never"
        )
        detail = f"Printer '{printer.name}' is offline (last seen {last_seen})."
    else:
        detail = "No active festival printer is configured."

    body = (
        f"Printing is stuck: {pending_count} ticket(s) queued "
        f"({ready_count} ready, {claimed_count} claimed), oldest "
        f"waiting {waiting_minutes} min.\n{detail}"
    )
    payloads = format_stuck_ticket_payloads(new_jobs)
    if payloads:
        body = f"{body}\n\n{payloads}"
    newest = new_jobs[-1]
    sent = send_festival_alert(
        body,
        throttle_key=f"unprinted:{newest.pk}",
        throttle_seconds=3600,
    )
    if sent:
        advance_printer_offline_watermark(max(job.created_at for job in new_jobs))
    logger.warning(
        "Festival printer unhealthy with %s pending jobs (%s new)",
        pending_count,
        len(new_jobs),
    )
    return {"pending": pending_count}


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
