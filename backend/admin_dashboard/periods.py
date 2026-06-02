"""
Dashboard ?period= query handling.

Supported values: 7d, 30d, 90d, this_month (default 30d).
Custom date_from/date_to ranges can be added in a later phase.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.utils import timezone

VALID_PERIODS = frozenset({"7d", "30d", "90d", "this_month"})
DEFAULT_PERIOD = "30d"


def normalize_period(period: str | None) -> str:
    """Return a supported period key; unknown values default to 30d."""
    key = (period or DEFAULT_PERIOD).strip().lower()
    if key not in VALID_PERIODS:
        return DEFAULT_PERIOD
    return key


def get_period_range(period: str | None) -> tuple[datetime, datetime]:
    """
    Map a period query param to (date_from, date_to).

    date_from is inclusive; date_to is ``timezone.now()`` (inclusive when filtering
    with ``created_at__lte=date_to``).
    """
    period_key = normalize_period(period)
    now = timezone.now()

    if period_key == "7d":
        date_from = now - timedelta(days=7)
    elif period_key == "30d":
        date_from = now - timedelta(days=30)
    elif period_key == "90d":
        date_from = now - timedelta(days=90)
    elif period_key == "this_month":
        date_from = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        date_from = now - timedelta(days=30)

    return date_from, now
