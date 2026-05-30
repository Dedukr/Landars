from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"

def send_telegram_message(text: str) -> tuple[bool, str, str, bool]:
    """
    Send a Telegram message using the Bot API.

    Returns (success, provider_message_id, error_message, retriable).
    Never raises to callers.
    """
    if not getattr(settings, "TELEGRAM_ORDER_ALERTS_ENABLED", False):
        logger.info("Telegram order alerts disabled; message not sent")
        return False, "", "Telegram order alerts disabled", False

    token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
    chat_id = getattr(settings, "TELEGRAM_ADMIN_CHAT_ID", "")
    if not token or not chat_id:
        logger.warning("Telegram bot token or admin chat ID not configured")
        return False, "", "Telegram credentials not configured", False

    timeout = getattr(settings, "TELEGRAM_ORDER_ALERTS_TIMEOUT_SECONDS", 10)
    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        response = requests.post(url, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        if not data.get("ok"):
            error = data.get("description") or "Telegram API returned ok=false"
            logger.warning("Telegram sendMessage failed: %s", error)
            return False, "", error, False
        message_id = str(data.get("result", {}).get("message_id", ""))
        logger.info("Telegram message sent successfully")
        return True, message_id, "", False
    except requests.Timeout:
        logger.warning("Telegram sendMessage timed out after %ss", timeout)
        return False, "", "Telegram API timeout", True
    except requests.RequestException as exc:
        logger.warning("Telegram sendMessage request failed: %s", exc.__class__.__name__)
        return False, "", str(exc), True
    except Exception as exc:
        logger.exception("Unexpected error sending Telegram message")
        return False, "", str(exc), False
