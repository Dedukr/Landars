from __future__ import annotations

import logging
import secrets
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from .sendcloud_client import SendcloudAPIError, SendcloudClient

from .method_mapping import pick_sendcloud_method_id, pick_sendcloud_method_row

logger = logging.getLogger(__name__)


def methods_cache_key(
    sender_address_id: int,
    to_country: str,
    postal_code: str,
    weight_kg: float,
) -> str:
    """
    Django cache key for GET /shipping_methods.

    Always includes **sender_address_id** (``sa…``), destination, postcode slice,
    and billable weight so lists match Sendcloud's sender + route + weight filters.
    """
    pc = (postal_code or "").replace(" ", "")[:12]
    wk = round(float(weight_kg), 3)
    sa = int(sender_address_id)
    return f"sc:shipping_methods:sa{sa}:dest{to_country.upper()}:pc{pc}:w{wk}"


def invalidate_shipping_methods_cache(
    *,
    sender_address_id: int,
    to_country: str,
    to_postal_code: str,
    weight_kg: float,
) -> None:
    """Drop cached /shipping_methods for this sender + destination + weight context."""
    from django.core.cache import cache

    key = methods_cache_key(sender_address_id, to_country, to_postal_code, weight_kg)
    cache.delete(key)


def get_shipping_methods_for_shipment(
    client: SendcloudClient,
    *,
    sender_address_id: int,
    to_country: str,
    to_postal_code: str,
    weight_kg: float,
    cache_ttl: int | None = None,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    """
    GET /shipping_methods with ``sender_address`` so results match the panel context.

    ``cache_ttl``: seconds for Django cache; defaults to ``SENDCLOUD_METHODS_CACHE_TTL``.
    Celery tasks should pass a shorter TTL via ``resolve_live_method_id(..., cache_ttl=...)``.
    ``force_refresh``: bypass cache read and replace entry (e.g. after invalid method id).
    """
    from django.core.cache import cache

    ttl = (
        cache_ttl
        if cache_ttl is not None
        else getattr(settings, "SENDCLOUD_METHODS_CACHE_TTL", 3600)
    )
    key = methods_cache_key(sender_address_id, to_country, to_postal_code, weight_kg)

    def load() -> list[dict[str, Any]]:
        return client.get_shipping_methods(
            to_country=to_country,
            to_postal_code=to_postal_code or None,
            weight=weight_kg,
            sender_address_id=sender_address_id,
        )

    if force_refresh:
        cache.delete(key)

    cached = cache.get(key)
    if cached is not None:
        return cached

    methods = load()
    cache.set(key, methods, ttl)
    return methods


def resolve_live_method_id(
    client: SendcloudClient,
    *,
    logical_option: str,
    sender_address_id: int,
    to_country: str,
    to_postal_code: str,
    weight_kg: float,
    cache_ttl: int | None = None,
    force_refresh: bool = False,
) -> int:
    """
    Resolve our logical Royal Mail option to Sendcloud's volatile shipping **method** id.

    The id is taken from the latest ``shipping_methods`` API response only; it is then
    sent at parcel creation in the JSON body as ``shipment: { "id": <method_id> }``.
    """
    methods = get_shipping_methods_for_shipment(
        client,
        sender_address_id=sender_address_id,
        to_country=to_country,
        to_postal_code=to_postal_code,
        weight_kg=weight_kg,
        cache_ttl=cache_ttl,
        force_refresh=force_refresh,
    )
    return pick_sendcloud_method_id(methods, logical_option, weight_kg)


def resolve_parcel_shipping_method_id(
    client: SendcloudClient,
    *,
    shipping_method_id: int | None,
    logical_option: str,
    sender_address_id: int,
    to_country: str,
    to_postal_code: str,
    weight_kg: float,
    cache_ttl: int | None = None,
    force_refresh: bool = False,
    use_checkout_method: bool = True,
) -> tuple[int, str, str]:
    """
    Sendcloud ``shipment.id`` for ``POST /parcels``: checkout id when still valid,
    else :func:`pick_sendcloud_method_row` for ``logical_option``.

    Returns ``(method_id, logical_option_for_storage, shipping_method_full_name)``
    — Sendcloud ``name`` on the chosen row (empty if the API omits it).
    """
    from .method_mapping import (
        logical_shipping_option_for_method_row,
        resolve_checkout_sendcloud_method_id,
    )

    methods = get_shipping_methods_for_shipment(
        client,
        sender_address_id=sender_address_id,
        to_country=to_country,
        to_postal_code=to_postal_code,
        weight_kg=weight_kg,
        cache_ttl=cache_ttl,
        force_refresh=force_refresh,
    )
    w = float(weight_kg)
    if use_checkout_method and shipping_method_id:
        cid = resolve_checkout_sendcloud_method_id(
            methods,
            int(shipping_method_id),
            w,
        )
        if cid is not None:
            row: dict[str, Any] | None = next(
                (
                    m
                    for m in methods
                    if m.get("id") is not None
                    and int(m["id"]) == int(cid)
                ),
                None,
            )
            inferred = logical_shipping_option_for_method_row(row) if row else None
            display = str((row or {}).get("name") or "").strip()
            return int(cid), str(inferred or logical_option), display
    picked = pick_sendcloud_method_row(methods, logical_option, w)
    display = str(picked.get("name") or "").strip()
    return int(picked["id"]), logical_option, display


def build_sendcloud_order_reference(order: Any) -> str:
    """
    External reference for Sendcloud ``order_number``: ``{prefix}-{order_id}-{n}``.

    ``n`` is a 10-digit cryptographically random integer so the value stays unique
    at Sendcloud without embedding dates or slot ids.
    """
    from django.conf import settings as dj_settings

    prefix = getattr(dj_settings, "SENDCLOUD_ORDER_NUMBER_PREFIX", "FP") or "FP"
    prefix = str(prefix).strip() or "FP"
    oid = order.pk
    oid_part = str(oid) if oid is not None else "new"
    # 1_000_000_000 .. 9_999_999_999 — fixed width, avoids leading-zero ambiguity
    rnd = secrets.randbelow(9_000_000_000) + 1_000_000_000
    ref = f"{prefix}-{oid_part}-{rnd}"
    return ref[:128]


def unique_sendcloud_order_reference_for_recreate(
    order: Any,
    _shipment_id: int,
) -> str:
    """
    New ``order_number`` for Sendcloud after a cancelled / bad parcel so
    ``POST /parcels`` is not treated as a duplicate of the old reference.
    Same shape as :func:`build_sendcloud_order_reference` (new random suffix).
    """
    return build_sendcloud_order_reference(order)


def patch_shipment_sendcloud_inputs(shipment_pk: int, updates: dict[str, Any]) -> None:
    """Merge ``updates`` into ``Shipment.sendcloud_inputs`` (JSON)."""
    from .models import Shipment

    with transaction.atomic():
        sh = Shipment.objects.select_for_update().filter(pk=shipment_pk).first()
        if sh is None:
            return
        inp = dict(sh.sendcloud_inputs or {})
        inp.update(updates)
        Shipment.objects.filter(pk=shipment_pk).update(sendcloud_inputs=inp)


def sendcloud_task_work_from_shipment(ship: Any) -> dict[str, Any]:
    """Build Celery work dict fragments from ``ship.sendcloud_inputs`` (+ hardcoded GBP)."""
    inp = ship.sendcloud_inputs or {}
    raw_w = inp.get("total_weight_kg")
    try:
        billable = float(raw_w) if raw_w is not None else 0.0
    except (TypeError, ValueError):
        billable = 0.0
    sid = inp.get("sender_address_id")
    return {
        "snap": inp.get("address_snapshot") or {},
        "lines": list(inp.get("item_lines_snapshot") or []),
        "billable_kg": billable,
        "logical_option": inp.get("logical_shipping_option") or "",
        "sender_address_id": int(sid) if sid is not None else 0,
        "total_order_value": str(inp.get("total_order_value") or "0"),
        "total_order_value_currency": "GBP",
        "total_item_quantity": Decimal(str(inp.get("total_item_quantity") or "0.01")),
        "sendcloud_order_reference": (inp.get("sendcloud_order_reference") or "").strip(),
    }


def _snapshot_total_item_quantity(total_quantity_units: Decimal) -> Decimal:
    """Sum of order line quantities for ``Shipment.total_item_quantity`` (2 dp, min 0.01)."""
    q = total_quantity_units.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if q < Decimal("0.01"):
        return Decimal("0.01")
    return q


def build_shipment_snapshot(order: Any) -> dict[str, Any]:
    """
    Build dict of fields for ``Shipment`` creation from a paid order.

    ``shipping_method_id`` is copied from the checkout row (the id the
    customer was quoted). Celery prefers it at parcel creation when Sendcloud still
    returns that row for the frozen weight and route; otherwise
    ``logical_shipping_option`` + weight bands select the method.
    """
    from django.conf import settings as dj_settings

    address = order.get_delivery_address()
    if not address:
        raise ValueError("Order has no delivery address")

    sender_raw = getattr(dj_settings, "SENDCLOUD_SENDER_ADDRESS_ID", None)
    if sender_raw in (None, ""):
        raise ValueError("SENDCLOUD_SENDER_ADDRESS_ID is not configured")
    sender_address_id = int(sender_raw)

    customer_name = (order.customer.name if order.customer else "").strip()
    if not customer_name:
        raise ValueError("Customer name is required for courier shipment")
    email = (order.customer.email if order.customer else "") or ""
    phone = ""
    if (
        order.customer
        and getattr(order.customer, "profile", None)
        and order.customer.profile
    ):
        phone = order.customer.profile.phone or ""

    address_snapshot = {
        "recipient_name": customer_name,
        "address_line": (address.address_line or "").strip(),
        "address_line2": (address.address_line2 or "").strip(),
        "city": (address.city or "").strip(),
        "postal_code": (address.postal_code or "").strip(),
        "country": "GB",
        "phone": phone,
        "email": email,
    }

    from .ideal_postcodes import try_cleanse_uk_address_snapshot

    def _require_order_address_fields() -> None:
        if not address_snapshot["address_line"]:
            raise ValueError("Order address line is required for courier shipment")
        if not address_snapshot["city"]:
            raise ValueError("Order city is required for courier shipment")
        if not address_snapshot["postal_code"]:
            raise ValueError("Order postcode is required for courier shipment")

    incomplete = (
        not address_snapshot["address_line"]
        or not address_snapshot["city"]
        or not address_snapshot["postal_code"]
    )
    if incomplete:
        try_cleanse_uk_address_snapshot(address_snapshot)
    try:
        _require_order_address_fields()
    except ValueError:
        if try_cleanse_uk_address_snapshot(address_snapshot):
            _require_order_address_fields()
        else:
            raise

    sendcloud_order_reference = build_sendcloud_order_reference(order)

    lines: list[dict[str, Any]] = []
    total_quantity_units = Decimal(0)
    for item in order.items.select_related("product").all():
        pid = item.product_id
        name = (
            item.item_name
            if item.item_name
            else (item.product.name if item.product else "Item")
        )
        unit_w = (
            item.product.weight
            if item.product and item.product.weight is not None
            else Decimal("0")
        )
        line_total = item.get_total_price()
        if line_total == "":
            line_total_dec = Decimal("0")
        else:
            line_total_dec = Decimal(str(line_total))

        qty = item.quantity
        total_quantity_units += qty

        lines.append(
            {
                "product_id": pid,
                "name": name,
                "quantity": str(qty),
                "unit_weight_kg": str(unit_w),
                "line_total": str(line_total_dec),
            }
        )

    if order.pk and getattr(order, "weight", None) is None:
        order.refresh_weight()

    # Parcel kg: single source = Order.weight (refreshed on order/line save).
    tw_order = getattr(order, "weight", None)
    if tw_order is not None:
        total_weight = Decimal(str(tw_order))
        if total_weight <= 0:
            total_weight = Decimal("0.1")
        else:
            total_weight = total_weight.quantize(
                Decimal("0.001"), rounding=ROUND_HALF_UP
            )
    else:
        total_weight = order.total_weight
        if total_weight <= 0:
            total_weight = Decimal("0.1")
        else:
            total_weight = total_weight.quantize(
                Decimal("0.001"), rounding=ROUND_HALF_UP
            )

    total_order_value = Decimal(str(order.sum_price)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    billable_kg = float(total_weight)
    use_weight_logical = getattr(
        dj_settings, "POST_SHIPMENT_USE_WEIGHT_BASED_LOGICAL", True
    )
    if use_weight_logical:
        from .method_mapping import logical_shipping_option_for_billable_kg

        logical = logical_shipping_option_for_billable_kg(billable_kg)
    else:
        logical = getattr(dj_settings, "POST_SHIPMENT_LOGICAL_OPTION", "uk_tracked_48")

    details = getattr(order, "shipping_details", None)
    checkout_mid: int | None = None
    if details is not None and details.shipping_method_id:
        checkout_mid = int(details.shipping_method_id)

    return {
        "shipping_method_id": checkout_mid,
        "sendcloud_inputs": {
            "address_snapshot": address_snapshot,
            "item_lines_snapshot": lines,
            "logical_shipping_option": logical,
            "total_weight_kg": str(total_weight),
            "total_order_value": str(total_order_value),
            "total_item_quantity": str(
                _snapshot_total_item_quantity(total_quantity_units)
            ),
            "sender_address_id": sender_address_id,
            "sendcloud_order_reference": sendcloud_order_reference,
        },
    }


def parcel_row_defaults_from_sendcloud_parcel_dict(
    parcel: dict[str, Any],
) -> dict[str, Any]:
    """Normalize Sendcloud parcel JSON into :class:`~shipping.models.Shipment` provider field kwargs."""
    from .parcel_extraction import resolve_provider_label_and_document_url

    pid = parcel.get("id")
    if pid is None:
        raise ValueError("Sendcloud parcel payload missing id")
    pid = int(pid)
    provider_label_url, _ = resolve_provider_label_and_document_url(parcel)
    tracking = parcel.get("tracking_number") or ""
    tu = parcel.get("tracking_url")
    tracking_url = ""
    if isinstance(tu, str):
        tracking_url = tu.strip()[:600]
    carrier_code = ""
    cobj = parcel.get("carrier")
    if isinstance(cobj, dict):
        carrier_code = str(cobj.get("code") or "")
    return {
        "sendcloud_parcel_id": pid,
        "shipping_tracking_number": tracking,
        "carrier_code": carrier_code,
        "shipping_tracking_url": tracking_url or None,
        "provider_label_url": (provider_label_url or "")[:600],
    }


def pick_parcel_for_order_reference(
    parcels: list[dict[str, Any]],
    order_ref: str,
) -> dict[str, Any] | None:
    """
    ``order_number`` is not globally unique in Sendcloud; prefer the newest matching id.
    """
    ref = (order_ref or "").strip()
    if not ref or not parcels:
        return None
    matches: list[dict[str, Any]] = []
    for p in parcels:
        if not isinstance(p, dict):
            continue
        onum = str(p.get("order_number") or "").strip()
        if onum == ref:
            matches.append(p)
    if not matches:
        return None
    matches.sort(key=lambda x: int(x.get("id") or 0), reverse=True)
    return matches[0]


def try_recover_remote_parcel_for_shipment(
    client: SendcloudClient,
    *,
    shipment_id: int,
    order_reference: str,
) -> bool:
    """
    If ``Shipment.sendcloud_parcel_id`` is unset, list remote parcels by ``order_number``
    and persist a match — covers worker crash after Sendcloud created the parcel.

    Returns True if a parcel id is stored after this call (set here or by a peer).
    """
    from django.db import transaction

    from .models import Shipment

    order_reference = (order_reference or "").strip()
    if not order_reference:
        return False
    if Shipment.objects.filter(pk=shipment_id, sendcloud_parcel_id__isnull=False).exclude(
        sendcloud_parcel_id=0
    ).exists():
        return True
    try:
        parcels = client.list_parcels({"order_number": order_reference})
    except Exception as exc:
        logger.warning(
            "Sendcloud GET /parcels recovery failed for shipment %s: %s",
            shipment_id,
            exc,
        )
        return False

    parcel = pick_parcel_for_order_reference(parcels, order_reference)
    if parcel is None:
        return False
    pid = parcel.get("id")
    if pid is None:
        return False
    try:
        live = client.get_parcel(int(pid))
    except SendcloudAPIError as exc:
        logger.warning(
            "Sendcloud recovery: GET /parcels/%s failed for shipment %s (order_number=%s): %s",
            pid,
            shipment_id,
            order_reference,
            exc,
        )
        return False
    if not live or live.get("id") is None:
        logger.warning(
            "Sendcloud recovery: parcel %s from list not returned by GET /parcels/%s "
            "(shipment %s order_number=%s) — not creating local row",
            pid,
            pid,
            shipment_id,
            order_reference,
        )
        return False
    try:
        defaults = parcel_row_defaults_from_sendcloud_parcel_dict(live)
    except ValueError:
        return False

    with transaction.atomic():
        ship = Shipment.objects.select_for_update().filter(pk=shipment_id).first()
        if ship is None:
            return False
        if ship.sendcloud_parcel_id:
            return True
        Shipment.objects.filter(pk=shipment_id).update(
            sendcloud_parcel_id=defaults["sendcloud_parcel_id"],
            shipping_tracking_number=defaults["shipping_tracking_number"],
            carrier_code=defaults["carrier_code"],
            shipping_tracking_url=defaults["shipping_tracking_url"],
            provider_label_url=defaults["provider_label_url"],
            status=Shipment.Status.LABEL_DOWNLOAD_PENDING,
            last_error="",
        )
    logger.info(
        "Recovered Sendcloud parcel %s for shipment %s via order_number=%s",
        defaults["sendcloud_parcel_id"],
        shipment_id,
        order_reference,
    )
    return True
