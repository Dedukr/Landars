from __future__ import annotations

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)

# Default cool-down between identical alerts so a flapping printer
# does not flood the admin chat.
DEFAULT_THROTTLE_SECONDS = 600


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
