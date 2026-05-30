from __future__ import annotations

import logging

from celery import shared_task

from notifications.services.order_alerts import (
    TelegramAlertRetriableError,
    send_new_order_admin_alert,
)

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_new_order_telegram_alert_task(self, order_id: int) -> bool:
    """Celery task: send Telegram admin alert for a new frontend order."""
    try:
        return send_new_order_admin_alert(order_id)
    except TelegramAlertRetriableError as exc:
        logger.warning(
            "Retrying Telegram alert for order %s (attempt %s): %s",
            order_id,
            self.request.retries + 1,
            exc,
        )
        raise self.retry(exc=exc)
    except Exception:
        logger.exception(
            "Unexpected error in Telegram alert task for order %s", order_id
        )
        return False
