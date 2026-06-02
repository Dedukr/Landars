from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

VALID_PERIODS = frozenset({"7d", "30d", "90d", "this_month"})
DEFAULT_PERIOD = "30d"


@dataclass(frozen=True)
class DashboardPeriod:
    key: str
    start: datetime
    end: datetime


def resolve_dashboard_period(period: str | None) -> DashboardPeriod:
    """
    Map ?period= query values to an inclusive start / exclusive-end UTC window.
    Unknown values fall back to 30d.
    """
    key = (period or DEFAULT_PERIOD).strip().lower()
    if key not in VALID_PERIODS:
        key = DEFAULT_PERIOD

    end = timezone.now()
    if key == "7d":
        start = end - timedelta(days=7)
    elif key == "90d":
        start = end - timedelta(days=90)
    elif key == "this_month":
        start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # 30d
        start = end - timedelta(days=30)

    return DashboardPeriod(key=key, start=start, end=end)
