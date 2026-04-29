"""
Apply Sendcloud parcel JSON (webhook body or GET /parcels/:id) to :class:`~shipping.models.Shipment`.

Sendcloud parcel payloads vary slightly by API version; we read several common keys for dates.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

logger = logging.getLogger(__name__)


def parse_sendcloud_datetime(val: Any) -> datetime | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        dt = val
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    s = str(val).strip()
    if not s:
        return None
    normalized = s.replace("Z", "+00:00") if s.endswith("Z") else s
    dt = parse_datetime(normalized)
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.utc)
    return dt


def parse_sendcloud_date_only(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return timezone.localtime(val).date() if timezone.is_aware(val) else val.date()
    dt = parse_sendcloud_datetime(val)
    if dt:
        return timezone.localtime(dt).date()
    d = parse_date(str(val)[:10])
    return d


def extract_expected_delivery_date(parcel: dict[str, Any]) -> date | None:
    for key in (
        "expected_delivery_date",
        "estimated_delivery_date",
        "delivery_date",
        "delivery_deadline",
    ):
        raw = parcel.get(key)
        if raw not in (None, ""):
            d = parse_sendcloud_date_only(raw)
            if d:
                return d
    return None


def extract_delivered_at(parcel: dict[str, Any]) -> datetime | None:
    for key in ("date_delivered", "delivered_at", "delivery_time"):
        raw = parcel.get(key)
        if raw not in (None, ""):
            dt = parse_sendcloud_datetime(raw)
            if dt:
                return dt
    return None


def webhook_event_datetime(
    payload: dict[str, Any], parcel: dict[str, Any]
) -> datetime | None:
    for key in ("timestamp", "time"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw.strip():
            dt = parse_sendcloud_datetime(raw)
            if dt:
                return dt
    for key in ("updated_at", "date_updated"):
        raw = parcel.get(key)
        if isinstance(raw, str) and raw.strip():
            dt = parse_sendcloud_datetime(raw)
            if dt:
                return dt
    return None


def apply_sendcloud_parcel_to_shipment(
    shipment,
    parcel: dict[str, Any],
    *,
    mapped_courier_status: str | None,
    event_time: datetime | None = None,
) -> list[str]:
    from shipping.models import Shipment

    update_fields: list[str] = []

    now = timezone.now()
    if event_time is None:
        event_time = now

    last_at = getattr(shipment, "sendcloud_last_webhook_at", None)
    if last_at and event_time < last_at:
        logger.debug(
            "Skipping stale Sendcloud parcel update for shipment %s (event %s < stored %s)",
            shipment.pk,
            event_time,
            last_at,
        )
        return []

    status_block = parcel.get("status")
    if not isinstance(status_block, dict):
        status_block = {}
    sid_raw = status_block.get("id")
    try:
        sid_int = int(sid_raw) if sid_raw is not None and sid_raw != "" else None
    except (TypeError, ValueError):
        sid_int = None
    smsg = str(status_block.get("message") or "")[:512]

    if sid_int != shipment.sendcloud_carrier_status_id:
        shipment.sendcloud_carrier_status_id = sid_int
        update_fields.append("sendcloud_carrier_status_id")
    if smsg != (shipment.sendcloud_carrier_status_message or ""):
        shipment.sendcloud_carrier_status_message = smsg
        update_fields.append("sendcloud_carrier_status_message")

    edd = extract_expected_delivery_date(parcel)
    if edd and edd != shipment.expected_delivery_date:
        shipment.expected_delivery_date = edd
        update_fields.append("expected_delivery_date")

    del_at = extract_delivered_at(parcel)
    if mapped_courier_status == "delivered" and del_at is None:
        del_at = now
    if del_at and shipment.delivered_at != del_at:
        shipment.delivered_at = del_at
        update_fields.append("delivered_at")

    if mapped_courier_status == "shipment_failed":
        if shipment.status != Shipment.Status.FAILED_FINAL:
            if shipment.status != Shipment.Status.FAILED_RETRYABLE:
                shipment.status = Shipment.Status.FAILED_RETRYABLE
                update_fields.append("status")
        err = (smsg or "")[:2000]
        if err and shipment.last_error != err:
            shipment.last_error = err
            update_fields.append("last_error")

    tracking_number = parcel.get("tracking_number")
    if isinstance(tracking_number, str) and tracking_number.strip():
        tn = tracking_number.strip()
        if shipment.shipping_tracking_number != tn:
            shipment.shipping_tracking_number = tn
            update_fields.append("shipping_tracking_number")

    tracking_url = parcel.get("tracking_url")
    tu = tracking_url.strip()[:600] if isinstance(tracking_url, str) else ""
    if tu and shipment.shipping_tracking_url != tu:
        shipment.shipping_tracking_url = tu
        update_fields.append("shipping_tracking_url")

    carrier = parcel.get("carrier")
    if isinstance(carrier, dict):
        code = str(carrier.get("code") or "")[:64]
        if code and shipment.carrier_code != code:
            shipment.carrier_code = code
            update_fields.append("carrier_code")

    parcel_updated = (
        parse_sendcloud_datetime(parcel.get("updated_at"))
        or parse_sendcloud_datetime(parcel.get("date_updated"))
    )
    sync_ts = event_time
    if parcel_updated and parcel_updated > sync_ts:
        sync_ts = parcel_updated
    if shipment.sendcloud_last_webhook_at != sync_ts:
        shipment.sendcloud_last_webhook_at = sync_ts
        update_fields.append("sendcloud_last_webhook_at")

    return update_fields
