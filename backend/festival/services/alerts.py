from __future__ import annotations

import html
import logging
from datetime import datetime

from django.core.cache import cache
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)

# Default cool-down between identical alerts so a flapping printer
# does not flood the admin chat.
DEFAULT_THROTTLE_SECONDS = 600

# Telegram messages max out at 4096 chars; leave room for the festival header.
_STUCK_PAYLOAD_BUDGET = 2800
_STUCK_PAYLOAD_MAX_JOBS = 5

# Newest ``created_at`` whose ticket text was already included in an offline
# alert. Later unprinted jobs get details next time (print jobs use UUID pks).
_OFFLINE_WATERMARK_KEY = "festival:alert:printer-offline:watermark"
_OFFLINE_WATERMARK_TTL = 60 * 60 * 24 * 30


def get_printer_offline_watermark() -> datetime | None:
    try:
        raw = cache.get(_OFFLINE_WATERMARK_KEY)
    except Exception:
        logger.exception("Failed to read printer-offline alert watermark")
        return None
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    parsed = parse_datetime(str(raw))
    return parsed


def advance_printer_offline_watermark(when: datetime) -> None:
    """Record that ticket details through ``when`` have been alerted."""
    try:
        current = get_printer_offline_watermark()
        if current is None or when > current:
            cache.set(
                _OFFLINE_WATERMARK_KEY,
                when.isoformat(),
                timeout=_OFFLINE_WATERMARK_TTL,
            )
    except Exception:
        logger.exception("Failed to advance printer-offline alert watermark")


def alert_unprinted_print_jobs(
    jobs, *, printer, require_offline: bool = True
) -> bool:
    """
    Telegram when print jobs are queued but not printing.

    When ``require_offline`` is True (order enqueue path), only fires if the
    printer is already offline. When False (delayed verify), fires for any
    still-pending jobs regardless of online status.

    Advances the unprinted watermark on success so the periodic health check
    does not repeat the same tickets.
    """
    job_list = list(jobs)
    if not job_list:
        return False
    try:
        printer.refresh_from_db()
    except Exception:
        pass
    online = bool(getattr(printer, "is_online", False))
    if require_offline and online:
        return False

    from festival.models import FestivalPrintJob

    pending = FestivalPrintJob.objects.filter(
        status__in=[
            FestivalPrintJob.Status.READY,
            FestivalPrintJob.Status.CLAIMED,
        ]
    )
    pending_count = pending.count()
    ready_count = pending.filter(status=FestivalPrintJob.Status.READY).count()
    claimed_count = pending_count - ready_count
    oldest = pending.order_by("created_at").first()
    from django.utils import timezone

    waiting_minutes = (
        int((timezone.now() - oldest.created_at).total_seconds() // 60)
        if oldest
        else 0
    )
    last_seen = (
        printer.last_seen_at.strftime("%H:%M") if printer.last_seen_at else "never"
    )
    if online:
        detail = (
            f"Printer '{printer.name}' is online (last seen {last_seen}) "
            "but tickets were not printed in time."
        )
    else:
        detail = f"Printer '{printer.name}' is offline (last seen {last_seen})."
    body = (
        f"Printing is stuck: {pending_count} ticket(s) queued "
        f"({ready_count} ready, {claimed_count} claimed), oldest "
        f"waiting {waiting_minutes} min.\n{detail}"
    )
    payloads = format_stuck_ticket_payloads(job_list)
    if payloads:
        body = f"{body}\n\n{payloads}"

    newest = job_list[-1]
    sent = send_festival_alert(
        body,
        throttle_key=f"unprinted:{newest.pk}",
        throttle_seconds=3600,
    )
    if sent:
        advance_printer_offline_watermark(
            max(job.created_at for job in job_list)
        )
    return sent


def format_stuck_ticket_payloads(
    jobs,
    *,
    max_jobs: int = _STUCK_PAYLOAD_MAX_JOBS,
    total_count: int | None = None,
) -> str:
    """
    Append printable ticket bodies for stuck/queued jobs to a Telegram alert.

    Escapes HTML for Telegram ``parse_mode=HTML``. Truncates when many jobs
    or long payloads would exceed Telegram's message limit.
    """
    from festival.services.tickets import strip_markup_tags

    job_list = list(jobs)
    shown = job_list[:max_jobs]
    if not shown:
        return ""

    sections: list[str] = []
    used = 0
    truncated_early = False
    for job in shown:
        job_type = job.get_job_type_display()
        order = job.order
        if order is not None:
            label = f"{job_type} · ticket #{order.order_number} (order {order.pk})"
        else:
            label = f"{job_type} · no order"
        raw = job.payload_text or "(empty payload)"
        body = strip_markup_tags(raw).rstrip()
        section = (
            f"<b>{html.escape(str(label))}</b>\n"
            f"<pre>{html.escape(body)}</pre>"
        )
        if used and used + len(section) + 40 > _STUCK_PAYLOAD_BUDGET:
            sections.append("<i>…further ticket text omitted</i>")
            truncated_early = True
            break
        if len(section) > _STUCK_PAYLOAD_BUDGET - used:
            room = max(80, _STUCK_PAYLOAD_BUDGET - used - 80)
            truncated = html.escape(body)[:room] + "…"
            sections.append(
                f"<b>{html.escape(str(label))}</b>\n"
                f"<pre>{truncated}</pre>"
            )
            truncated_early = True
            break
        sections.append(section)
        used += len(section) + 2

    overall = total_count if total_count is not None else len(job_list)
    included = sum(1 for s in sections if s.startswith("<b>"))
    if overall > included and not truncated_early:
        sections.append(f"<i>…plus {overall - included} more ticket(s) not shown</i>")

    return "<b>Tickets in this event</b>\n\n" + "\n\n".join(sections)


def send_festival_alert(
    text: str,
    *,
    throttle_key: str,
    throttle_seconds: int = DEFAULT_THROTTLE_SECONDS,
) -> bool:
    """
    Send a festival ops alert to the admin Telegram chat.

    Throttled per `throttle_key`: at most one message per `throttle_seconds`.
    Never raises. Returns True when a message was actually sent.
    """
    cache_key = f"festival:alert:{throttle_key}"
    try:
        if not cache.add(cache_key, 1, timeout=throttle_seconds):
            logger.info("Festival alert throttled: %s", throttle_key)
            return False
    except Exception:
        # Cache unavailable must not stop the alert.
        logger.exception("Festival alert throttle cache failed; sending anyway")

    from notifications.services.telegram import send_telegram_message

    message = f"🎪 <b>Festival till</b>\n{text}"
    ok, _message_id, error, _retriable = send_telegram_message(message)
    if not ok:
        logger.warning("Festival alert not sent (%s): %s", throttle_key, error)
    return ok
