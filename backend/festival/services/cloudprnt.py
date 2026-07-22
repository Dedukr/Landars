from __future__ import annotations

import logging
import secrets
import urllib.parse
import uuid
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from festival.models import (
    FestivalPrintJob,
    FestivalPrinter,
    normalize_mac_address,
    payload_sha256,
)

logger = logging.getLogger(__name__)


class CloudPRNTAuthError(Exception):
    pass


class CloudPRNTError(Exception):
    def __init__(self, message: str, *, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class CloudPRNTPollResult:
    body: dict[str, Any]
    status: int = 200


def authenticate_cloudprnt(request) -> None:
    username = getattr(settings, "FESTIVAL_CLOUDPRNT_USERNAME", "") or ""
    password = getattr(settings, "FESTIVAL_CLOUDPRNT_PASSWORD", "") or ""
    mode = getattr(settings, "FESTIVAL_PRINT_MODE", "disabled")

    if mode == "cloudprnt":
        if not username or not password or password in {"", "changeme", "password"}:
            raise CloudPRNTAuthError("CloudPRNT credentials are not configured.")

    header = request.META.get("HTTP_AUTHORIZATION", "")
    if not header.startswith("Basic "):
        raise CloudPRNTAuthError("Missing Basic authentication.")

    import base64

    try:
        decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        provided_user, provided_pass = decoded.split(":", 1)
    except Exception as exc:
        raise CloudPRNTAuthError("Invalid Basic authentication.") from exc

    user_ok = secrets.compare_digest(provided_user, username)
    pass_ok = secrets.compare_digest(provided_pass, password)
    if not (user_ok and pass_ok):
        raise CloudPRNTAuthError("Invalid credentials.")


def decode_status_code(raw: str | None) -> tuple[str, str]:
    if not raw:
        return "", ""
    decoded = urllib.parse.unquote(str(raw)).strip()
    parts = decoded.split(None, 1)
    code = parts[0] if parts else ""
    text = parts[1] if len(parts) > 1 else decoded
    return code, text


def parse_status_numeric(code: str) -> int | None:
    try:
        return int((code or "").split()[0])
    except (ValueError, IndexError):
        return None


def printer_is_operational(status_code: str) -> bool:
    numeric = parse_status_numeric(status_code)
    if numeric is None:
        return False
    # 2xx online; 220/221 busy with paper present — do not offer new jobs.
    if numeric in (220, 221):
        return False
    return 200 <= numeric < 300


def get_active_printer_for_mac(mac_raw: str) -> FestivalPrinter:
    mac = normalize_mac_address(mac_raw)
    try:
        printer = FestivalPrinter.objects.select_for_update().get(
            mac_address=mac, is_active=True
        )
    except FestivalPrinter.DoesNotExist as exc:
        raise CloudPRNTError("Unknown printer MAC.", status=403) from exc
    return printer


def create_print_batch(
    *,
    order,
    printer: FestivalPrinter,
    jobs: list[tuple[str, int, str]],
    is_reprint: bool = False,
    retry_of_map: dict[int, FestivalPrintJob] | None = None,
) -> list[FestivalPrintJob]:
    """
    Create READY print jobs for a batch.

    jobs: list of (job_type, sequence, payload_text)
    """
    batch_uuid = uuid.uuid4()
    now = timezone.now()
    created: list[FestivalPrintJob] = []
    retry_of_map = retry_of_map or {}
    for job_type, sequence, payload in jobs:
        checksum = payload_sha256(payload)
        job = FestivalPrintJob.objects.create(
            batch_uuid=batch_uuid,
            order=order,
            printer=printer,
            job_type=job_type,
            sequence=sequence,
            status=FestivalPrintJob.Status.READY,
            media_type="text/plain",
            payload_text=payload,
            payload_checksum=checksum,
            is_reprint=is_reprint,
            retry_of=retry_of_map.get(sequence),
            available_at=now,
        )
        created.append(job)
    return created


def _queue_blocked_by_failed(batch_uuid) -> bool:
    return FestivalPrintJob.objects.filter(
        batch_uuid=batch_uuid,
        status=FestivalPrintJob.Status.FAILED,
    ).exists()


def _next_ready_job(printer: FestivalPrinter) -> FestivalPrintJob | None:
    """
    Select the next READY job for the printer.

    Priority:
    1. Continue an in-progress batch (has PRINTED/CLAIMED siblings)
    2. Otherwise the oldest READY batch (by available_at, then created_at)
    3. Lowest sequence within that batch, with earlier sequences already PRINTED
    """
    ready_jobs = list(
        FestivalPrintJob.objects.filter(
            printer=printer,
            status=FestivalPrintJob.Status.READY,
            available_at__lte=timezone.now(),
        )
        .order_by("available_at", "created_at", "sequence")
        .only("id", "batch_uuid", "sequence", "available_at", "created_at")
    )
    if not ready_jobs:
        return None

    batch_meta: dict = {}
    for job in ready_jobs:
        meta = batch_meta.setdefault(
            job.batch_uuid,
            {
                "available_at": job.available_at,
                "created_at": job.created_at,
                "has_progress": False,
            },
        )
        meta["available_at"] = min(meta["available_at"], job.available_at)
        meta["created_at"] = min(meta["created_at"], job.created_at)

    for batch_uuid in batch_meta:
        batch_meta[batch_uuid]["has_progress"] = FestivalPrintJob.objects.filter(
            batch_uuid=batch_uuid,
            status__in=[
                FestivalPrintJob.Status.CLAIMED,
                FestivalPrintJob.Status.PRINTED,
            ],
        ).exists()

    ordered_batches = sorted(
        batch_meta.items(),
        key=lambda item: (
            0 if item[1]["has_progress"] else 1,
            item[1]["available_at"],
            item[1]["created_at"],
            str(item[0]),
        ),
    )

    for batch_uuid, _meta in ordered_batches:
        if _queue_blocked_by_failed(batch_uuid):
            continue
        job = (
            FestivalPrintJob.objects.select_for_update()
            .filter(
                printer=printer,
                batch_uuid=batch_uuid,
                status=FestivalPrintJob.Status.READY,
                available_at__lte=timezone.now(),
            )
            .order_by("sequence")
            .first()
        )
        if not job:
            continue
        earlier_pending = FestivalPrintJob.objects.filter(
            batch_uuid=batch_uuid,
            sequence__lt=job.sequence,
        ).exclude(
            status__in=[
                FestivalPrintJob.Status.PRINTED,
                FestivalPrintJob.Status.CANCELLED,
            ]
        )
        if earlier_pending.exists():
            continue
        return job
    return None


def _mark_inferred_printed(job: FestivalPrintJob, note: str) -> None:
    job.status = FestivalPrintJob.Status.PRINTED
    job.acknowledged_at = timezone.now()
    job.completed_at = timezone.now()
    job.completion_source = FestivalPrintJob.CompletionSource.INFERRED_FROM_POLL
    job.audit_note = (job.audit_note + "\n" if job.audit_note else "") + note
    job.save(
        update_fields=[
            "status",
            "acknowledged_at",
            "completed_at",
            "completion_source",
            "audit_note",
            "updated_at",
        ]
    )
    logger.warning(
        "Inferred print completion for job %s: %s",
        job.job_token,
        note,
    )


@transaction.atomic
def handle_poll(payload: dict, *, mac_override: str | None = None) -> dict:
    mac_raw = mac_override or payload.get("printerMAC") or ""
    printer = get_active_printer_for_mac(mac_raw)

    status_code, status_text = decode_status_code(payload.get("statusCode"))
    printing_in_progress = bool(payload.get("printingInProgress"))
    client_token = payload.get("jobToken") or None
    unique_id = payload.get("uniqueID") or ""

    printer.last_seen_at = timezone.now()
    printer.last_status_code = status_code
    printer.last_status_text = status_text
    printer.printing_in_progress = printing_in_progress
    if unique_id:
        printer.unique_id = str(unique_id)[:64]

    encodings = None
    for action in payload.get("clientAction") or []:
        if isinstance(action, dict) and action.get("request") == "Encodings":
            encodings = action.get("result")
    if encodings:
        printer.supported_media_types = [
            part.strip() for part in str(encodings).split(";") if part.strip()
        ]

    # Reconcile claimed job / lost acknowledgement.
    claimed = (
        FestivalPrintJob.objects.select_for_update()
        .filter(printer=printer, status=FestivalPrintJob.Status.CLAIMED)
        .order_by("claimed_at")
        .first()
    )

    if claimed:
        if client_token and str(client_token) == str(claimed.job_token):
            printer.current_job_token = claimed.job_token
            printer.save()
            return {
                "jobReady": True,
                "mediaTypes": [claimed.media_type],
                "jobToken": str(claimed.job_token),
                "deleteMethod": "DELETE",
            }

        # Lost POST response: re-advertise same claimed job when idle for that token.
        if not client_token and not printing_in_progress and claimed.fetched_at:
            # Official lost-DELETE inference: previously fetched, now idle without token.
            _mark_inferred_printed(
                claimed,
                "Lost DELETE inferred: poll without jobToken after fetch "
                "with printingInProgress=false.",
            )
            printer.current_job_token = None
            claimed = None
        elif not client_token and not printing_in_progress and not claimed.fetched_at:
            # Re-advertise the unfetched claimed job (lost jobReady response).
            printer.current_job_token = claimed.job_token
            printer.save()
            return {
                "jobReady": True,
                "mediaTypes": [claimed.media_type],
                "jobToken": str(claimed.job_token),
                "deleteMethod": "DELETE",
            }
        else:
            printer.current_job_token = claimed.job_token
            printer.save()
            return {"jobReady": False}

    if client_token and not claimed:
        # Printer still reporting a token we already finished — idle response.
        existing = FestivalPrintJob.objects.filter(
            printer=printer, job_token=client_token
        ).first()
        if existing and existing.status == FestivalPrintJob.Status.PRINTED:
            printer.current_job_token = None
            printer.save()
            return {"jobReady": False}

    if printing_in_progress or not printer_is_operational(status_code):
        printer.current_job_token = None if not client_token else client_token
        if isinstance(printer.current_job_token, str):
            try:
                printer.current_job_token = uuid.UUID(str(printer.current_job_token))
            except ValueError:
                printer.current_job_token = None
        printer.save()
        return {"jobReady": False}

    job = _next_ready_job(printer)
    if not job:
        printer.current_job_token = None
        printer.save()
        return {"jobReady": False}

    if payload_sha256(job.payload_text) != job.payload_checksum:
        job.status = FestivalPrintJob.Status.FAILED
        job.last_error = "Payload checksum mismatch before claim."
        job.save(update_fields=["status", "last_error", "updated_at"])
        printer.last_error = job.last_error
        printer.current_job_token = None
        printer.save()
        _alert_job_failed_after_commit(job)
        return {"jobReady": False}

    job.status = FestivalPrintJob.Status.CLAIMED
    job.claimed_at = timezone.now()
    job.save(update_fields=["status", "claimed_at", "updated_at"])
    printer.current_job_token = job.job_token
    printer.save()
    logger.info(
        "Claimed festival print job %s type=%s order=%s",
        job.job_token,
        job.job_type,
        job.order_id,
    )
    return {
        "jobReady": True,
        "mediaTypes": [job.media_type],
        "jobToken": str(job.job_token),
        "deleteMethod": "DELETE",
    }


@transaction.atomic
def handle_job_get(*, mac: str, media_type: str, token: str) -> bytes:
    printer = get_active_printer_for_mac(mac)
    if media_type != "text/plain":
        raise CloudPRNTError("Unsupported media type.", status=415)
    try:
        token_uuid = uuid.UUID(str(token))
    except ValueError as exc:
        raise CloudPRNTError("Unknown job token.", status=404) from exc

    try:
        job = FestivalPrintJob.objects.select_for_update().get(
            job_token=token_uuid, printer=printer
        )
    except FestivalPrintJob.DoesNotExist as exc:
        raise CloudPRNTError("Unknown job token.", status=404) from exc

    if job.status != FestivalPrintJob.Status.CLAIMED:
        raise CloudPRNTError("Job is not available for download.", status=409)

    if payload_sha256(job.payload_text) != job.payload_checksum:
        raise CloudPRNTError("Payload checksum mismatch.", status=500)

    job.fetched_at = timezone.now()
    job.attempt_count += 1
    job.save(update_fields=["fetched_at", "attempt_count", "updated_at"])
    printer.last_seen_at = timezone.now()
    printer.current_job_token = job.job_token
    printer.save(update_fields=["last_seen_at", "current_job_token", "updated_at"])
    return job.payload_text.encode("utf-8")


def failed_job_alert_text(job: FestivalPrintJob) -> str:
    """Human-readable ticket details for a failed print job."""
    import html

    order = job.order
    job_type = job.get_job_type_display()
    lines = [
        f"❌ Ticket print FAILED: {html.escape(job_type)} ticket "
        f"#{order.order_number}",
        f"Error: {html.escape(job.last_error or 'unknown error')}",
        "",
    ]
    for item in order.items.all():
        lines.append(
            f"• {item.quantity} × {html.escape(item.display_name)} — "
            f"£{item.line_total}"
        )
    lines.append(f"<b>Total: £{order.total_price}</b>")
    created = timezone.localtime(order.created_at).strftime("%H:%M")
    lines.append(f"Placed at {created}")
    lines.append("Auto-retry is scheduled; check the printer.")
    return "\n".join(lines)


def _alert_job_failed_after_commit(job: FestivalPrintJob) -> None:
    """Queue a Telegram alert for a FAILED job once the transaction commits."""
    text = failed_job_alert_text(job)
    # One alert per ticket per window, even if retries of it also fail.
    throttle_key = f"job-failed:{job.order_id}:{job.job_type}"

    def enqueue() -> None:
        from festival.tasks import send_festival_alert_task

        try:
            send_festival_alert_task.delay(text, throttle_key)
        except Exception:
            logger.exception("Failed to enqueue festival print-failure alert")

    transaction.on_commit(enqueue)


def _is_terminal_client_failure(code: str) -> bool:
    numeric = parse_status_numeric(code)
    if numeric is None:
        return False
    # 51x media errors are terminal for this payload.
    return 510 <= numeric <= 519


def _is_success_code(code: str) -> bool:
    numeric = parse_status_numeric(code)
    return numeric is not None and 200 <= numeric < 300


@transaction.atomic
def handle_job_delete(
    *, mac: str, token: str, code: str, retry: int | None = None
) -> None:
    printer = get_active_printer_for_mac(mac)
    try:
        token_uuid = uuid.UUID(str(token))
    except ValueError as exc:
        raise CloudPRNTError("Unknown job token.", status=404) from exc

    try:
        job = FestivalPrintJob.objects.select_for_update().get(
            job_token=token_uuid, printer=printer
        )
    except FestivalPrintJob.DoesNotExist as exc:
        raise CloudPRNTError("Unknown job token.", status=404) from exc

    status_code, status_text = decode_status_code(code)
    printer.last_seen_at = timezone.now()
    printer.last_status_code = status_code
    printer.last_status_text = status_text

    if job.status == FestivalPrintJob.Status.PRINTED:
        # Idempotent successful DELETE.
        printer.current_job_token = None
        printer.printing_in_progress = False
        printer.save()
        return

    if job.status not in (
        FestivalPrintJob.Status.CLAIMED,
        FestivalPrintJob.Status.FAILED,
    ):
        raise CloudPRNTError("Job cannot be acknowledged in its current state.", status=409)

    job.last_result_code = status_code

    if _is_success_code(status_code):
        job.status = FestivalPrintJob.Status.PRINTED
        job.acknowledged_at = timezone.now()
        job.completed_at = timezone.now()
        job.completion_source = FestivalPrintJob.CompletionSource.DELETE
        job.last_error = ""
        job.save()
        printer.current_job_token = None
        printer.printing_in_progress = False
        printer.last_error = ""
        printer.save()
        logger.info("Printed festival job %s (retry=%s)", job.job_token, retry)
        return

    if _is_terminal_client_failure(status_code):
        job.status = FestivalPrintJob.Status.FAILED
        job.last_error = status_text or status_code
        job.save()
        printer.current_job_token = None
        printer.printing_in_progress = False
        printer.last_error = job.last_error
        printer.save()
        logger.error(
            "Festival print job %s failed with %s",
            job.job_token,
            status_code,
        )
        _alert_job_failed_after_commit(job)
        return

    # Transient printer conditions (paper out, cover open): keep CLAIMED for retry.
    job.last_error = status_text or status_code
    job.save(update_fields=["last_result_code", "last_error", "updated_at"])
    printer.last_error = job.last_error
    printer.save()


def server_settings_http_only() -> dict:
    """Response that keeps MQTT-capable printers on Version HTTP."""
    return {
        "version": "1.0",
        "protocol": "HTTP",
    }


def get_active_printer() -> FestivalPrinter | None:
    return FestivalPrinter.objects.filter(is_active=True).first()


def queue_depth(printer: FestivalPrinter | None = None) -> int:
    qs = FestivalPrintJob.objects.filter(
        status__in=[
            FestivalPrintJob.Status.READY,
            FestivalPrintJob.Status.CLAIMED,
        ]
    )
    if printer:
        qs = qs.filter(printer=printer)
    return qs.count()


def printer_status_payload() -> dict:
    enabled = bool(getattr(settings, "FESTIVAL_ENABLED", False))
    mode = getattr(settings, "FESTIVAL_PRINT_MODE", "disabled")
    printer = get_active_printer()
    online = bool(printer and printer.is_online)
    queued = queue_depth(printer) if printer else 0
    require_printer = bool(getattr(settings, "FESTIVAL_PRINTER_REQUIRED", True))
    allow_offline = bool(
        getattr(settings, "FESTIVAL_ALLOW_ORDERS_WHEN_PRINTER_OFFLINE", False)
    )
    can_accept = enabled
    if mode == "cloudprnt" and require_printer and not allow_offline:
        can_accept = enabled and online
    elif mode == "disabled":
        can_accept = enabled

    return {
        "enabled": enabled,
        "mode": mode,
        "online": online if mode == "cloudprnt" else mode == "disabled",
        "last_seen_at": (
            printer.last_seen_at.isoformat().replace("+00:00", "Z")
            if printer and printer.last_seen_at
            else None
        ),
        "queued_jobs": queued,
        "can_accept_orders": can_accept,
        "status_code": printer.last_status_code if printer else "",
        "status_text": printer.last_status_text if printer else "",
    }


def retry_chain_depth(job: FestivalPrintJob) -> int:
    """How many times this payload has already been retried."""
    depth = 0
    current = job
    while current.retry_of_id is not None and depth < 20:
        depth += 1
        current = current.retry_of
    return depth


@transaction.atomic
def create_retry_job(failed_job: FestivalPrintJob) -> FestivalPrintJob:
    if failed_job.status != FestivalPrintJob.Status.FAILED:
        raise CloudPRNTError("Only failed jobs can be retried.")
    sibling_ready = FestivalPrintJob.objects.filter(
        batch_uuid=failed_job.batch_uuid,
        sequence=failed_job.sequence,
        status=FestivalPrintJob.Status.READY,
    ).exists()
    if sibling_ready:
        raise CloudPRNTError("A replacement job is already ready.")

    # Create a replacement in a new single-job batch that preserves sequence ordering
    # relative to the unfinished remainder by using a new batch only for the failed
    # sequence, then requeue remaining READY jobs stay as-is.
    payload = failed_job.payload_text
    jobs = create_print_batch(
        order=failed_job.order,
        printer=failed_job.printer,
        jobs=[(failed_job.job_type, failed_job.sequence, payload)],
        is_reprint=failed_job.is_reprint,
        retry_of_map={failed_job.sequence: failed_job},
    )
    replacement = jobs[0]
    # Supersede the failed job so it no longer blocks the rest of its batch
    # and cannot be retried twice.
    failed_job.status = FestivalPrintJob.Status.CANCELLED
    failed_job.audit_note = (
        failed_job.audit_note + "\n" if failed_job.audit_note else ""
    ) + f"Superseded by retry job {replacement.job_token}."
    failed_job.save(update_fields=["status", "audit_note", "updated_at"])
    return replacement


def create_reprint_batch(order, *, is_copy: bool = True) -> list[FestivalPrintJob]:
    from festival.services.tickets import (
        render_customer_ticket,
        render_kitchen_ticket,
    )

    printer = get_active_printer()
    if not printer:
        raise CloudPRNTError("No active festival printer.")
    invoice = order.invoice
    kitchen = render_kitchen_ticket(order, is_copy=is_copy)
    customer = render_customer_ticket(order, invoice, is_copy=is_copy)
    return create_print_batch(
        order=order,
        printer=printer,
        jobs=[
            (FestivalPrintJob.JobType.KITCHEN, 1, kitchen),
            (FestivalPrintJob.JobType.CUSTOMER, 2, customer),
        ],
        is_reprint=True,
    )
