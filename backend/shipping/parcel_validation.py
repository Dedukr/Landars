"""Validate frozen snapshot + method context before POST /parcels (Sendcloud v2)."""

from __future__ import annotations

from typing import Any


def _needs_recipient_address_cleanse(snap: dict[str, Any]) -> bool:
    """True when GB-style address is incomplete (Ideal cleanse may fill gaps)."""
    country = (snap.get("country") or "").strip().upper()
    if country not in ("GB", "UK", ""):
        return False
    addr = (snap.get("address_line") or "").strip()
    city = (snap.get("city") or "").strip()
    pc = (snap.get("postal_code") or "").strip()
    return not addr or not city or not pc


def _raise_if_bad_recipient_address(snap: dict[str, Any]) -> None:
    name = (snap.get("recipient_name") or "").strip()
    if not name:
        raise ValueError("Recipient name is required")

    addr = (snap.get("address_line") or "").strip()
    if not addr:
        raise ValueError("Address line (house number / street) is required")

    city = (snap.get("city") or "").strip()
    if not city:
        raise ValueError("City is required")

    pc = (snap.get("postal_code") or "").strip()
    if not pc:
        raise ValueError("Postcode is required")

    country = (snap.get("country") or "").strip().upper()
    if not country:
        raise ValueError("Country is required")
    if len(country) != 2:
        raise ValueError("Country must be a 2-letter ISO 3166-1 alpha-2 code")


def validate_sendcloud_parcel_prerequisites(
    *,
    address_snapshot: dict[str, Any],
    billable_weight_kg: float,
    shipping_method_id: int,
    sender_address_id: int,
    order_number: str,
    total_order_value: str | None,
    total_order_value_currency: str | None,
) -> None:
    """
    Ensure recipient, route, weight, and shipping method are present before
    ``request_label: true`` parcel creation.

    For incomplete UK addresses, attempts Ideal Postcodes Address Cleanse before
    raising (see :mod:`shipping.ideal_postcodes`).
    """
    from .ideal_postcodes import try_cleanse_uk_address_snapshot

    if not sender_address_id or int(sender_address_id) <= 0:
        raise ValueError("Sendcloud sender_address id is missing or invalid")

    if not shipping_method_id or int(shipping_method_id) <= 0:
        raise ValueError(
            "Shipping method id is missing or invalid (resolve methods first)"
        )

    if billable_weight_kg <= 0:
        raise ValueError("Parcel weight must be positive (billable kg)")

    on = (order_number or "").strip()
    if not on:
        raise ValueError("order_number (external reference) must be non-empty")

    if total_order_value is None or str(total_order_value).strip() == "":
        raise ValueError("total_order_value is required for parcel creation")

    cur = (total_order_value_currency or "").strip()
    if not cur:
        raise ValueError("total_order_value_currency is required for parcel creation")

    snap = address_snapshot
    if (snap.get("country") or "").strip().upper() == "UK":
        snap["country"] = "GB"

    if _needs_recipient_address_cleanse(snap):
        try_cleanse_uk_address_snapshot(snap)

    try:
        _raise_if_bad_recipient_address(snap)
    except ValueError:
        if try_cleanse_uk_address_snapshot(snap):
            _raise_if_bad_recipient_address(snap)
        else:
            raise
