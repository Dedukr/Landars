"""Holiday (Christmas / New Year) website orders.

Customers choose an occasion, never a day. A holiday cart pays the event's
``surcharge_percent`` on its items subtotal; the rate is frozen into
``Order.holiday_fee`` at checkout. Holiday orders are home-delivery only —
parcel (post) carts can't be holiday orders.
"""

from __future__ import annotations

from typing import Any

from django.core.cache import cache

HOLIDAY_EVENTS_CACHE_KEY = "api:holiday_events:open:v1"
HOLIDAY_EVENTS_CACHE_SECONDS = 300

UNAVAILABLE_CODE = "holiday_unavailable"
POST_DELIVERY_MESSAGE = (
    "Holiday delivery isn't available for parcel (post) orders."
)


def open_holiday_events():
    """Events customers can choose right now."""
    from api.models import HolidayEvent

    return list(HolidayEvent.objects.filter(active=True).order_by("theme", "id"))


def serialize_holiday_event(event) -> dict[str, Any] | None:
    if event is None:
        return None
    return {
        "id": event.id,
        "name": event.name,
        "theme": event.theme,
        "emoji": event.emoji,
        "label": event.label,
        "surcharge_percent": str(event.surcharge_percent),
        "delivery_window_label": event.delivery_window_label,
    }


def open_holiday_events_payload() -> list[dict[str, Any]]:
    """Cached public list used by ``GET /api/holiday-events/``."""
    data = cache.get(HOLIDAY_EVENTS_CACHE_KEY)
    if data is None:
        data = [serialize_holiday_event(e) for e in open_holiday_events()]
        cache.set(HOLIDAY_EVENTS_CACHE_KEY, data, HOLIDAY_EVENTS_CACHE_SECONDS)
    return data


def invalidate_holiday_events_cache() -> None:
    cache.delete(HOLIDAY_EVENTS_CACHE_KEY)


def holiday_choice_error(event, cart) -> str | None:
    """Why ``cart`` can't be a holiday order for ``event`` (None when it can)."""
    if event is None or not event.is_open():
        name = getattr(event, "name", "Holiday")
        return f"{name} orders are closed. Please choose regular delivery."
    if not cart.is_home_delivery:
        return POST_DELIVERY_MESSAGE
    return None
