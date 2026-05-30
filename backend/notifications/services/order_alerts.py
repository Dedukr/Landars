from __future__ import annotations

import logging

from django.conf import settings
from django.db import IntegrityError, transaction

from api.models import Order
from notifications.models import NotificationLog
from notifications.services.telegram import send_telegram_message
from notifications.services.telegram_formatting import format_order_for_telegram

logger = logging.getLogger(__name__)


class TelegramAlertRetriableError(Exception):
    """Raised when the Telegram alert should be retried by Celery."""


def send_new_order_admin_alert(order_id: int) -> bool:
    """
    Send a Telegram admin alert for a frontend order if not already sent.

    Returns True when a message was sent successfully.
    Raises TelegramAlertRetriableError for transient failures when Celery should retry.
    """
    try:
        order = (
            Order.objects.select_related("customer", "customer__profile", "address")
            .prefetch_related("items", "items__product")
            .get(pk=order_id)
        )
    except Order.DoesNotExist:
        logger.warning("Telegram alert skipped: order %s not found", order_id)
        return False

    if order.source != Order.Source.FRONTEND:
        logger.info(
            "Telegram alert skipped for order %s (source=%s)",
            order_id,
            order.source,
        )
        return False

    if not getattr(settings, "TELEGRAM_ORDER_ALERTS_ENABLED", False):
        logger.info("Telegram order alerts disabled; skipping order %s", order_id)
        return False

    chat_id = getattr(settings, "TELEGRAM_ADMIN_CHAT_ID", "") or ""

    try:
        with transaction.atomic():
            log, created = NotificationLog.objects.select_for_update().get_or_create(
                order=order,
                channel=NotificationLog.Channel.TELEGRAM,
                event=NotificationLog.Event.NEW_FRONTEND_ORDER,
                defaults={
                    "recipient": chat_id,
                    "status": NotificationLog.Status.PENDING,
                },
            )
            if not created and log.status == NotificationLog.Status.SENT:
                logger.info(
                    "Telegram alert already sent for order %s; skipping duplicate",
                    order_id,
                )
                return False
    except IntegrityError:
        log = NotificationLog.objects.get(
            order=order,
            channel=NotificationLog.Channel.TELEGRAM,
            event=NotificationLog.Event.NEW_FRONTEND_ORDER,
        )
        if log.status == NotificationLog.Status.SENT:
            logger.info(
                "Telegram alert already sent for order %s; skipping duplicate",
                order_id,
            )
            return False

    if not chat_id or not getattr(settings, "TELEGRAM_BOT_TOKEN", ""):
        logger.warning(
            "Telegram credentials not configured; skipping alert for order %s",
            order_id,
        )
        log.status = NotificationLog.Status.SKIPPED
        log.error_message = "Telegram credentials not configured"
        log.save(update_fields=["status", "error_message", "updated_at"])
        return False

    message = format_order_for_telegram(order)
    success, provider_message_id, error_message, retriable = send_telegram_message(
        message
    )

    log.recipient = chat_id
    if success:
        log.status = NotificationLog.Status.SENT
        log.provider_message_id = provider_message_id
        log.error_message = ""
        log.save(
            update_fields=[
                "recipient",
                "status",
                "provider_message_id",
                "error_message",
                "updated_at",
            ]
        )
        logger.info("Telegram new-order alert sent for order %s", order_id)
        return True

    log.status = NotificationLog.Status.FAILED
    log.error_message = (error_message or "Unknown Telegram error")[:2000]
    log.save(update_fields=["recipient", "status", "error_message", "updated_at"])
    logger.warning("Telegram new-order alert failed for order %s", order_id)

    if retriable:
        raise TelegramAlertRetriableError(error_message or "Telegram API error")

    return False


def schedule_new_frontend_order_telegram_alert(order_id: int) -> None:
    """Schedule a Telegram alert after the current DB transaction commits."""
    from django.db import transaction

    from notifications.tasks import send_new_order_telegram_alert_task

    logger.info("Telegram alert scheduled for order %s", order_id)
    transaction.on_commit(lambda: send_new_order_telegram_alert_task.delay(order_id))
