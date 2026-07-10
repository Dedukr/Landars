"""
High-level Sendcloud integration: quotes, synchronous home-delivery parcels,
and parcel status.

Post-delivery fees use Sendcloud ``/shipping-price`` for the same method rows as
checkout quotes, then apply :setting:`POST_DELIVERY_SENDCLOUD_MARKUP_PERCENT`.

Kept aligned with :class:`~shipping.sendcloud_client.SendcloudClient` and checkout UI
(:class:`ShipmentQuoteOption` in the marketplace).
"""

from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.conf import settings

from .method_mapping import _carrier_blob, method_row_accepts_parcel_weight
from .parcel_extraction import resolve_provider_label_and_document_url
from .sendcloud_client import SendcloudAPIError, SendcloudClient
from .services import build_sendcloud_order_reference, build_shipment_snapshot

logger = logging.getLogger(__name__)


def _parcel_items_from_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Same shape as ``tasks._parcel_items_from_snapshot`` (no Celery import)."""
    out: list[dict[str, Any]] = []
    for line in lines:
        qty_raw = line.get("quantity") or "1"
        try:
            q_dec = Decimal(str(qty_raw))
        except (InvalidOperation, TypeError, ValueError):
            q_dec = Decimal("1")
        q_dec = max(q_dec, Decimal("0.01"))
        q_dec = q_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        out.append(
            {
                "description": line.get("name") or "Goods",
                "quantity": str(q_dec),
                "weight": str(line.get("unit_weight_kg") or "0.1"),
                "value": str(line.get("line_total") or "0"),
            }
        )
    return out


def _parcel_weight_kg_from_api_items(items: list[Any]) -> float:
    """
    Weight for quoting: cart items ``{product_id, quantity}`` use DB product weight×qty.
    If there is no ``product_id``, treat ``quantity`` as kg (management-command test helper).
    """
    if not items:
        return 0.1
    from api.models import Product

    contributions: list[tuple[int, Decimal]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        pid = it.get("product_id") or it.get("product")
        q_raw = it.get("quantity", 1)
        try:
            q = Decimal(str(q_raw))
        except (InvalidOperation, TypeError, ValueError):
            q = Decimal("1")
        if pid is not None:
            contributions.append((int(pid), q))
        else:
            return max(float(q), 0.1)
    if not contributions:
        return 0.1
    ids = {p for p, _ in contributions}
    products = {p.id: p for p in Product.objects.filter(id__in=ids)}
    total = Decimal(0)
    for pid, q in contributions:
        prod = products.get(pid)
        if prod and prod.weight is not None:
            total += Decimal(str(prod.weight)) * q
    w = float(total)
    return max(w, 0.1) if w > 0 else 0.1


def _allowed_carrier(method: dict[str, Any]) -> bool:
    allowed = getattr(settings, "SENDCLOUD_ALLOWED_CARRIERS", []) or []
    if not allowed:
        return True
    blob = _carrier_blob(method)
    return any(
        a.strip() and a.strip().lower() in blob for a in allowed if str(a).strip()
    )


def _allowed_service_name(name: str) -> bool:
    n = (name or "").lower()
    for ex in getattr(settings, "SENDCLOUD_EXCLUDE_SERVICES", []) or []:
        exs = str(ex).strip().lower()
        if exs and exs in n:
            return False
    allowed = getattr(settings, "SENDCLOUD_ALLOWED_SERVICES", []) or []
    if not allowed:
        return True
    return any(
        str(a).strip().lower() in n for a in allowed if str(a).strip()
    )


def _decimal_currency_from_shipping_price_dict(
    data: dict[str, Any] | None,
) -> tuple[Decimal | None, str]:
    """Parse Sendcloud shipping-price payload; currency defaults to GBP."""
    if not data or not isinstance(data, dict):
        return None, "GBP"
    cur = (data.get("currency") or "GBP").upper()
    for key in ("price", "shipping_price", "value", "amount"):
        raw = data.get(key)
        if raw is None:
            continue
        try:
            d = Decimal(str(raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            return d, cur
        except (InvalidOperation, TypeError, ValueError):
            continue
    return None, cur


def _eligible_sendcloud_quote_methods(
    client: SendcloudClient,
    *,
    sender_address_id: int,
    to_country: str,
    to_postal_code: str,
    weight: float,
) -> list[dict[str, Any]]:
    methods = client.get_shipping_methods(
        to_country=to_country,
        to_postal_code=to_postal_code or None,
        weight=weight,
        sender_address_id=sender_address_id,
    )
    eligible: list[dict[str, Any]] = []
    for m in methods:
        if not isinstance(m, dict) or m.get("id") is None:
            continue
        if not _allowed_carrier(m):
            continue
        name = str(m.get("name") or "")
        if not _allowed_service_name(name):
            continue
        if not method_row_accepts_parcel_weight(m, weight):
            continue
        eligible.append(m)
    return eligible


def _select_methods_to_quote_rows(
    eligible: list[dict[str, Any]], weight: float
) -> list[dict[str, Any]]:
    """
    Same rows as checkout ``get_shipping_options`` when weight-based collapse is on.

    Always quotes Royal Mail Tracked 24 (tightest tier for ``weight``).
    """
    from .method_mapping import pick_sendcloud_method_row

    if not eligible:
        return []

    collapse = bool(
        getattr(settings, "POST_SHIPMENT_USE_WEIGHT_BASED_LOGICAL", True)
    )
    if not collapse:
        return list(eligible)

    try:
        return [pick_sendcloud_method_row(eligible, "uk_tracked_24", float(weight))]
    except ValueError as exc:
        logger.warning(
            "Weight-based Sendcloud quote pick failed (%s); "
            "returning all eligible methods for this address.",
            exc,
        )
        return list(eligible)


def _format_option_price(
    client: SendcloudClient,
    method: dict[str, Any],
    *,
    to_country: str,
    to_postal_code: str,
    weight: float,
) -> tuple[str, str]:
    mid = method.get("id")
    if mid is None:
        return "0.00", "GBP"
    try:
        data = client.get_shipping_price(
            int(mid),
            to_country,
            to_postal_code or "",
            weight,
        )
    except SendcloudAPIError:
        return "0.00", "GBP"
    amt, cur = _decimal_currency_from_shipping_price_dict(
        data if isinstance(data, dict) else None
    )
    if amt is None:
        return "0.00", cur
    return f"{amt}", cur


def _method_to_quote_option(
    client: SendcloudClient,
    method: dict[str, Any],
    *,
    to_country: str,
    to_postal_code: str,
    weight: float,
) -> dict[str, Any]:
    carrier = method.get("carrier") if isinstance(method.get("carrier"), dict) else {}
    code = str(carrier.get("code") or "") if isinstance(carrier, dict) else ""
    logo = ""
    if isinstance(carrier, dict):
        logo = str(carrier.get("logo") or carrier.get("logo_url") or "").strip()

    countries_raw = method.get("countries") or []
    countries: list[str] = []
    if isinstance(countries_raw, list):
        for c in countries_raw:
            if isinstance(c, dict):
                cc = c.get("iso_2") or c.get("code") or c.get("name")
                if cc:
                    countries.append(str(cc).upper())
            elif isinstance(c, str):
                countries.append(c.upper())

    props = method.get("properties")
    if not isinstance(props, dict):
        props = {}

    price, currency = _format_option_price(
        client,
        method,
        to_country=to_country,
        to_postal_code=to_postal_code,
        weight=weight,
    )
    try:
        base_dec = Decimal(str(price))
    except (InvalidOperation, TypeError, ValueError):
        base_dec = Decimal("0")
    pct = float(
        getattr(settings, "POST_DELIVERY_SENDCLOUD_MARKUP_PERCENT", 20.0)
    )
    marked = base_dec * (
        Decimal("1") + Decimal(str(pct)) / Decimal("100")
    )
    price = f"{marked.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"

    spi = method.get("service_point_input")
    service_point_input = (
        str(spi).lower() if spi is not None else "none"
    )

    return {
        "id": int(method["id"]),
        "carrier": code or str(carrier.get("name") or "") if isinstance(carrier, dict) else "",
        "name": str(method.get("name") or ""),
        "service_point_input": service_point_input,
        "price": price,
        "currency": currency,
        "min_delivery_days": method.get("min_delivery_days"),
        "max_delivery_days": method.get("max_delivery_days"),
        "countries": countries,
        "properties": props,
        "logo_url": logo or None,
    }


class ShippingService:
    """Facade used by API views, payments webhook, cart fee logic, and admin tools."""

    def __init__(self) -> None:
        self.client = SendcloudClient()

    def get_post_delivery_fee_from_sendcloud(
        self,
        weight_kg: float | Decimal,
        *,
        to_country: str | None = None,
        to_postal_code: str | None = None,
    ) -> Decimal:
        """
        Lowest Sendcloud ``/shipping-price`` among checkout-equivalent method rows,
        multiplied by ``1 + POST_DELIVERY_SENDCLOUD_MARKUP_PERCENT / 100``.

        Uses :setting:`POST_DELIVERY_ESTIMATE_*` when destination is omitted (cart estimate).
        Returns ``0`` when over 20 kg, Sendcloud is unavailable, or no price is returned.
        """
        try:
            w = float(weight_kg)
        except (TypeError, ValueError):
            w = 0.1
        w = max(w, 0.1)
        if w > 20:
            return Decimal("0")

        sender_raw = getattr(settings, "SENDCLOUD_SENDER_ADDRESS_ID", None)
        if sender_raw in (None, ""):
            logger.warning(
                "get_post_delivery_fee_from_sendcloud: SENDCLOUD_SENDER_ADDRESS_ID unset; "
                "returning 0"
            )
            return Decimal("0")

        country = (to_country or getattr(
            settings, "POST_DELIVERY_ESTIMATE_COUNTRY", "GB"
        )).strip().upper() or "GB"
        postal = (
            (to_postal_code or getattr(
                settings, "POST_DELIVERY_ESTIMATE_POSTAL_CODE", "SW1A 1AA"
            )).strip()
        )

        pct = float(
            getattr(settings, "POST_DELIVERY_SENDCLOUD_MARKUP_PERCENT", 20.0)
        )
        mult = Decimal("1") + (
            Decimal(str(pct)) / Decimal("100")
        )

        try:
            eligible = _eligible_sendcloud_quote_methods(
                self.client,
                sender_address_id=int(sender_raw),
                to_country=country,
                to_postal_code=postal,
                weight=w,
            )
            rows = _select_methods_to_quote_rows(eligible, w)
            if not rows:
                return Decimal("0")

            base_prices: list[Decimal] = []
            for row in rows:
                mid = row.get("id")
                if mid is None:
                    continue
                try:
                    data = self.client.get_shipping_price(
                        int(mid),
                        country,
                        postal or "",
                        w,
                    )
                except SendcloudAPIError as e:
                    logger.debug(
                        "get_post_delivery_fee_from_sendcloud: price skip method %s: %s",
                        mid,
                        e,
                    )
                    continue
                if isinstance(data, list) and data and isinstance(data[0], dict):
                    data = data[0]
                amt, cur = _decimal_currency_from_shipping_price_dict(
                    data if isinstance(data, dict) else None
                )
                if amt is None:
                    continue
                if cur != "GBP":
                    logger.warning(
                        "Ignoring non-GBP shipping price %s %s for method %s",
                        amt,
                        cur,
                        mid,
                    )
                    continue
                base_prices.append(amt)

            if not base_prices:
                return Decimal("0")
            out = min(base_prices) * mult
            return out.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except SendcloudAPIError as e:
            logger.warning(
                "get_post_delivery_fee_from_sendcloud failed: %s",
                e,
            )
            return Decimal("0")

    @staticmethod
    def get_delivery_fee_by_weight(
        weight_kg: float | Decimal,
        *,
        to_country: str | None = None,
        to_postal_code: str | None = None,
    ) -> Decimal:
        """Post-delivery fee: Sendcloud base + configured markup (see :meth:`get_post_delivery_fee_from_sendcloud`)."""
        return ShippingService().get_post_delivery_fee_from_sendcloud(
            weight_kg,
            to_country=to_country,
            to_postal_code=to_postal_code,
        )

    @staticmethod
    def parcel_weight_kg_from_line_items(items: Any) -> float:
        total = Decimal(0)
        for item in items or []:
            if item is None:
                continue
            prod = getattr(item, "product", None)
            qty = getattr(item, "quantity", None)
            if qty is None:
                continue
            try:
                qd = Decimal(str(qty))
            except (InvalidOperation, TypeError, ValueError):
                qd = Decimal(0)
            if prod is not None and getattr(prod, "weight", None) is not None:
                total += Decimal(str(prod.weight)) * qd
        return float(total)

    @staticmethod
    def parcel_weight_kg_from_product_qty_pairs(
        normalized: list[tuple[Any, Any]],
    ) -> float:
        total = Decimal(0)
        for prod, qty in normalized or []:
            if prod is None or qty is None:
                continue
            try:
                qd = Decimal(str(qty))
            except (InvalidOperation, TypeError, ValueError):
                qd = Decimal(0)
            if getattr(prod, "weight", None) is not None:
                total += Decimal(str(prod.weight)) * qd
        return float(total)

    def get_shipping_options(
        self,
        *,
        address: dict[str, Any],
        items: list[Any],
        weight_based_single_method: bool | None = None,
    ) -> list[dict[str, Any]]:
        sender_raw = getattr(settings, "SENDCLOUD_SENDER_ADDRESS_ID", None)
        if sender_raw in (None, ""):
            raise SendcloudAPIError(
                "SENDCLOUD_SENDER_ADDRESS_ID is not configured; cannot list methods."
            )
        sender_address_id = int(sender_raw)

        country = str(address.get("country") or "GB").upper()
        postal = str(address.get("postal_code") or "").strip()
        weight = _parcel_weight_kg_from_api_items(list(items or []))

        eligible = _eligible_sendcloud_quote_methods(
            self.client,
            sender_address_id=sender_address_id,
            to_country=country,
            to_postal_code=postal,
            weight=weight,
        )

        collapse = weight_based_single_method
        if collapse is None:
            collapse = bool(
                getattr(settings, "POST_SHIPMENT_USE_WEIGHT_BASED_LOGICAL", True)
            )

        methods_to_quote = (
            _select_methods_to_quote_rows(eligible, weight)
            if collapse and eligible
            else eligible
        )

        out: list[dict[str, Any]] = []
        for m in methods_to_quote:
            out.append(
                _method_to_quote_option(
                    self.client,
                    m,
                    to_country=country,
                    to_postal_code=postal,
                    weight=weight,
                )
            )
        out.sort(key=lambda o: (Decimal(o["price"]), o["id"]))
        return out

    def create_shipment(self, order: Any, shipping_method_id: int) -> dict[str, Any]:
        """
        Synchronous POST /parcels for **home delivery** (checkout-chosen method id).

        Returns a small dict for REST handlers: ``parcel_id``, ``tracking_number``,
        ``tracking_url``, ``label_url``.
        """
        snapshot = build_shipment_snapshot(order)
        inp = snapshot["sendcloud_inputs"]
        s = inp["address_snapshot"]
        lines = inp.get("item_lines_snapshot") or []
        billable = float(inp.get("total_weight_kg") or 0.1)
        parcel_items = _parcel_items_from_lines(list(lines))

        parcel = self.client.create_parcel(
            name=s["recipient_name"],
            address=s["address_line"],
            address_2=(s.get("address_line2") or "").strip() or None,
            city=s["city"],
            postal_code=s["postal_code"],
            country=s.get("country") or "GB",
            email=s.get("email") or None,
            phone=s.get("phone") or None,
            shipping_method_id=int(shipping_method_id),
            weight=str(max(billable, 0.01)),
            order_number=build_sendcloud_order_reference(order),
            parcel_items=parcel_items or None,
            sender_address=int(inp["sender_address_id"]),
            request_label=True,
            total_order_value=str(inp.get("total_order_value") or "0"),
            total_order_value_currency="GBP",
        )
        label_url, _ = resolve_provider_label_and_document_url(parcel)
        pid = parcel.get("id")
        return {
            "parcel_id": int(pid) if pid is not None else None,
            "tracking_number": parcel.get("tracking_number") or "",
            "tracking_url": parcel.get("tracking_url") or "",
            "label_url": label_url or "",
        }

    def create_shipment_for_order(self, order: Any) -> dict[str, Any]:
        """
        Home-delivery path after payment: create parcel if needed.

        Returns ``{"skipped": True}`` for non-home or missing method id;
        ``{"success": True, "tracking_number": ...}`` on success;
        ``{"success": False, "error": ...}`` on failure.
        """
        from shipping.models import Shipment

        if not getattr(order, "is_home_delivery", False):
            return {"skipped": True}
        details = getattr(order, "shipping_details", None)
        if details is None or not details.shipping_method_id:
            return {"skipped": True}
        if details.sendcloud_parcel_id:
            return {
                "success": True,
                "skipped": True,
                "tracking_number": details.shipping_tracking_number or "",
            }
        try:
            payload = self.create_shipment(order, int(details.shipping_method_id))
        except SendcloudAPIError as e:
            logger.warning("create_shipment_for_order Sendcloud error: %s", e)
            details.last_error = str(e)[:2000]
            details.save(update_fields=["last_error"])
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.exception("create_shipment_for_order failed")
            details.last_error = str(e)[:2000]
            details.save(update_fields=["last_error"])
            return {"success": False, "error": str(e)}

        pid = payload.get("parcel_id")
        details.sendcloud_parcel_id = int(pid) if pid is not None else None
        details.shipping_tracking_number = payload.get("tracking_number") or ""
        tu = payload.get("tracking_url") or ""
        details.shipping_tracking_url = tu[:600] if tu else None
        details.provider_label_url = (payload.get("label_url") or "")[:600]
        details.status = Shipment.Status.LABEL_DOWNLOAD_PENDING
        details.last_error = ""
        details.save(
            update_fields=[
                "sendcloud_parcel_id",
                "shipping_tracking_number",
                "shipping_tracking_url",
                "provider_label_url",
                "status",
                "last_error",
            ]
        )
        return {
            "success": True,
            "tracking_number": details.shipping_tracking_number or "",
        }

    def get_shipment_status(self, parcel_id: int) -> dict[str, Any]:
        parcel = self.client.get_parcel(int(parcel_id))
        return {
            "parcel_id": parcel.get("id"),
            "status": parcel.get("status"),
            "tracking_number": parcel.get("tracking_number"),
            "tracking_url": parcel.get("tracking_url"),
        }
