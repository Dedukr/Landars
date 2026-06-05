"""Phone validation helpers for profiles and checkout."""

import re


def normalize_phone(phone: str | None) -> str:
    return (phone or "").strip()


def is_valid_phone(phone: str | None) -> bool:
    """Require at least 10 digits (UK/international-friendly)."""
    normalized = normalize_phone(phone)
    if not normalized:
        return False
    digits = re.sub(r"\D", "", normalized)
    return len(digits) >= 10
