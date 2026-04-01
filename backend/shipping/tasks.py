from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from celery import shared_task
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .parcel_extraction import (
    label_pdf_url_from_parcel_dict,
    resolve_provider_label_and_document_url,
)

logger = logging.getLogger(__name__)


def _parcel_sync_dict_from_shipment(ship: Any) -> dict[str, Any]:
    """Minimal parcel-shaped dict for customer-facing ``shipping_*`` sync (no raw API payload)."""
    carrier: dict[str, str] = {}
    if ship.carrier_code:
        carrier["code"] = ship.carrier_code
    return {
        "id": ship.sendcloud_parcel_id,
        "tracking_number": (ship.shipping_tracking_number or "") or "",
        "tracking_url": (getattr(ship, "shipping_tracking_url", None) or "").strip(),
        "carrier": carrier,
    }


def _is_sendcloud_announce_forbidden_error(exc: BaseException) -> bool:
    """
    HTTP 412 from Sendcloud when API credentials or account may not announce
    shipments to the carrier (onboarding, carrier contracts, or key scope).
    """
    from .sendcloud_client import SendcloudAPIError

    if not isinstance(exc, SendcloudAPIError):
        return False
    msg = str(exc).lower()
    return "412" in msg and "not allowed to announce" in msg


def _friendly_sendcloud_announce_forbidden_message() -> str:
    return (
        "Sendcloud returned HTTP 412 (User not allowed to announce). Your integration "
        "cannot hand parcels to the carrier yet. In Sendcloud: finish account/carrier "
        "activation, create a first test shipment in the panel if required, and ensure "
        "SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY are from the live shop/integration "
        "that is allowed to announce labels. Retrying the task will not help until "
        "Sendcloud enables announcement for these API credentials."
    )


def _is_likely_parcel_address_error(exc: BaseException) -> bool:
    """Heuristic: Sendcloud validation errors about recipient / address fields."""
    from .sendcloud_client import SendcloudAPIError

    if not isinstance(exc, SendcloudAPIError):
        return False
    msg = str(exc).lower()
    needles = (
        "address",
        "postcode",
        "postal",
        "zip",
        "recipient",
        "city",
        "street",
        "line_1",
        "line 1",
        "house",
        "invalid address",
        "delivery address",
    )
    return any(n in msg for n in needles)


def _is_invalid_shipping_method_error(exc: BaseException) -> bool:
    """Detect Sendcloud parcel errors where the resolved method id is no longer valid."""
    from .sendcloud_client import SendcloudAPIError

    if not isinstance(exc, SendcloudAPIError):
        return False
    msg = str(exc).lower()
    if any(
        x in msg
        for x in ("address", "postcode", "postal", "recipient", "city", "street")
    ):
        return False
    if "invalid" not in msg and "not valid" not in msg:
        return False
    return (
        "shipping method" in msg
        or "method id" in msg
        or ("method" in msg and "shipment" in msg)
    )


def _is_likely_duplicate_parcel_error(exc: BaseException) -> bool:
    """Heuristic: Sendcloud may reject a second create for the same order_number."""
    from .sendcloud_client import SendcloudAPIError

    if not isinstance(exc, SendcloudAPIError):
        return False
    msg = str(exc).lower()
    needles = (
        "duplicate",
        "already exist",
        "unique",
        "order_number",
        "external_reference",
        "idempotence",
    )
    return any(n in msg for n in needles)


def _recover_and_build_download_work(
    client: Any,
    shipment_id: int,
    order_reference: str,
) -> dict[str, Any] | None:
    """
    If ``Shipment.sendcloud_parcel_id`` is missing, list Sendcloud by ``order_number``
    and persist provider fields. Returns a ``download_only`` work dict when set, else None.
    """
    from .models import Shipment
    from .services import try_recover_remote_parcel_for_shipment

    if not try_recover_remote_parcel_for_shipment(
        client,
        shipment_id=shipment_id,
        order_reference=order_reference,
    ):
        return None
    ship = (
        Shipment.objects.filter(pk=shipment_id)
        .only(
            "order_id",
            "sendcloud_parcel_id",
            "provider_label_url",
            "shipping_tracking_number",
            "shipping_tracking_url",
            "carrier_code",
        )
        .first()
    )
    if ship is None or not ship.sendcloud_parcel_id:
        return None
    return {
        "mode": "download_only",
        "ship_id": shipment_id,
        "order_id": ship.order_id,
        "sendcloud_parcel_id": int(ship.sendcloud_parcel_id),
        "provider_label_url": ship.provider_label_url or "",
        "parcel_sync": _parcel_sync_dict_from_shipment(ship),
    }


def _parcel_items_from_snapshot(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def _download_label_pdf_bytes(
    client: Any,
    *,
    parcel_id: int,
    provider_label_url: str,
) -> tuple[bytes | None, str, dict[str, Any]]:
    """
    Download label PDF bytes. Tries create-response URL first, then GET /labels/{id}.
    Returns ``(bytes | None, error_message, labels_api_json)``.
    """
    from .sendcloud_client import SendcloudAPIError

    errors: list[str] = []
    labels_payload: dict[str, Any] = {}

    def try_download(url: str, source: str) -> bytes | None:
        if not url:
            return None
        try:
            return client.download_url(url)
        except SendcloudAPIError as e:
            errors.append(f"{source}: {e}")
            return None

    pdf = try_download(provider_label_url.strip(), "parcel_response")
    if pdf:
        return pdf, "", labels_payload

    try:
        labels_payload = client.get_labels_for_parcel(parcel_id)
    except SendcloudAPIError as e:
        errors.append(f"GET /labels/{parcel_id}: {e}")
        labels_payload = {}

    inner = (
        labels_payload.get("label") if isinstance(labels_payload, dict) else None
    ) or {}
    url2 = ""
    if isinstance(inner, dict) and inner:
        url2 = label_pdf_url_from_parcel_dict({"label": inner}) or ""

    pdf = try_download(url2, "labels_endpoint")
    if pdf:
        return pdf, "", labels_payload

    err = "; ".join(errors) if errors else "No label URL available"
    return None, err[:2000], labels_payload


def _sync_customer_shipping_fields(
    ship: Any, parcel: dict[str, Any], label_url: str | None
) -> None:
    """Persist tracking + optional label URL + carrier code after label pipeline."""
    try:
        cobj = parcel.get("carrier")
        if isinstance(cobj, dict):
            ship.carrier_code = str(cobj.get("code") or "")[:64]
        pid = parcel.get("id")
        if pid is not None:
            ship.sendcloud_parcel_id = int(pid)
        ship.shipping_tracking_number = parcel.get("tracking_number") or ""
        tu_raw = parcel.get("tracking_url")
        ship.shipping_tracking_url = (
            tu_raw.strip()[:600] if isinstance(tu_raw, str) else ""
        )
        if label_url:
            ship.provider_label_url = label_url[:600]
        upd = [
            "sendcloud_parcel_id",
            "carrier_code",
            "shipping_tracking_number",
            "shipping_tracking_url",
        ]
        if label_url:
            upd.append("provider_label_url")
        ship.save(update_fields=upd)
    except Exception:
        logger.exception(
            "Customer shipping field sync failed for shipment %s",
            getattr(ship, "pk", None),
        )


def _enrich_urls_after_labels_fetch(
    *,
    provider_label_url: str,
    labels_payload: dict[str, Any],
) -> tuple[str, dict[str, str]]:
    """Merge GET /labels response into the label URL and ``Shipment.provider_label_url`` updates."""
    pl = provider_label_url or ""
    if not pl and labels_payload:
        inner = labels_payload.get("label") or {}
        if isinstance(inner, dict):
            pl = label_pdf_url_from_parcel_dict({"label": inner}) or ""
    sp_updates: dict[str, str] = {}
    if pl:
        sp_updates["provider_label_url"] = pl[:600]
    return pl, sp_updates


def _apply_shipment_label_storage(
    ship_save: Any,
    *,
    pdf_bytes: bytes | None,
    dl_err: str,
    parcel_dict_for_sync: dict[str, Any],
    label_url_for_sync: str,
    parcel_url_updates: dict[str, str] | None = None,
) -> None:
    """Update Shipment label_* fields after a download attempt; sync legacy shipping details."""
    from billing.models import upload_bytes_to_s3

    from .models import Shipment

    now = timezone.now()
    if parcel_url_updates:
        for k, v in parcel_url_updates.items():
            setattr(ship_save, k, v)
        ship_save.save(update_fields=list(parcel_url_updates.keys()))

    if pdf_bytes:
        s3_key = (
            f"shipment_labels/{now:%Y/%m}/"
            f"order_{ship_save.order_id}_sc_{ship_save.sendcloud_parcel_id}.pdf"
        )
        upload_bytes_to_s3(
            pdf_bytes,
            s3_key,
            content_type="application/pdf",
        )
        ship_save.label_s3_key = s3_key
        ship_save.status = Shipment.Status.LABEL_READY
        ship_save.last_error = ""
        ship_save.save(
            update_fields=[
                "label_s3_key",
                "status",
                "last_error",
                "updated_at",
            ]
        )
    else:
        ship_save.status = Shipment.Status.LABEL_DOWNLOAD_FAILED
        ship_save.last_error = (dl_err or "Label download failed")[:2000]
        ship_save.save(
            update_fields=[
                "status",
                "last_error",
                "updated_at",
            ]
        )
        logger.warning(
            "Shipment %s Sendcloud parcel %s: label file not stored: %s",
            ship_save.pk,
            ship_save.sendcloud_parcel_id,
            ship_save.last_error,
        )

    _sync_customer_shipping_fields(
        ship_save, parcel_dict_for_sync, label_url_for_sync or None
    )


def _run_download_only_work(client: Any, w: dict[str, Any]) -> None:
    from .models import Shipment

    pid = int(w["sendcloud_parcel_id"])
    pl_url = w["provider_label_url"]
    pdf_bytes, dl_err, labels_payload = _download_label_pdf_bytes(
        client,
        parcel_id=pid,
        provider_label_url=pl_url,
    )
    pl_url, sp_updates = _enrich_urls_after_labels_fetch(
        provider_label_url=pl_url,
        labels_payload=labels_payload,
    )
    parcel_sync = w.get("parcel_sync")
    if not isinstance(parcel_sync, dict):
        parcel_sync = {}
    label_url_for_sync = pl_url or ""

    with transaction.atomic():
        ship_save = Shipment.objects.select_for_update().get(pk=w["ship_id"])
        parcel_dict = {**parcel_sync}
        parcel_dict.setdefault("id", ship_save.sendcloud_parcel_id)
        parcel_dict.setdefault(
            "tracking_number", (ship_save.shipping_tracking_number or "") or ""
        )
        parcel_dict.setdefault(
            "tracking_url",
            (getattr(ship_save, "shipping_tracking_url", None) or "").strip(),
        )
        _apply_shipment_label_storage(
            ship_save,
            pdf_bytes=pdf_bytes,
            dl_err=dl_err,
            parcel_dict_for_sync=parcel_dict,
            label_url_for_sync=label_url_for_sync,
            parcel_url_updates=sp_updates or None,
        )


def _post_parcel_or_recover_download(
    *,
    client: Any,
    work: dict[str, Any],
    post_fn: Any,
) -> dict[str, Any] | None:
    """
    Run ``post_fn`` (expected: Sendcloud ``POST /parcels``). On duplicate-order errors,
    recover the remote parcel and finish via :func:`_run_download_only_work`.

    Returns the create response dict, or ``None`` when the download-only path completed.
    """
    from .sendcloud_client import SendcloudAPIError

    try:
        return post_fn()
    except SendcloudAPIError as exc:
        if not _is_likely_duplicate_parcel_error(exc):
            raise
        logger.warning(
            "Sendcloud parcel create may be duplicate (shipment %s, order_number=%s): %s",
            work["ship_id"],
            work["sendcloud_order_reference"],
            exc,
        )
        w_rec = _recover_and_build_download_work(
            client,
            shipment_id=work["ship_id"],
            order_reference=work["sendcloud_order_reference"],
        )
        if w_rec is None:
            raise
        _run_download_only_work(client, w_rec)
        return None


def _patch_resolved_shipping_method(
    ship_id: int,
    work: dict[str, Any],
    logical_stored: str,
    method_full_name: str,
) -> None:
    """Persist logical key and Sendcloud method ``name`` from live method resolution."""
    from .services import patch_shipment_sendcloud_inputs

    updates: dict[str, Any] = {}
    if logical_stored != work["logical_option"]:
        updates["logical_shipping_option"] = logical_stored
    name = (method_full_name or "").strip()
    if name:
        updates["shipping_method_full_name"] = name[:500]
    if updates:
        patch_shipment_sendcloud_inputs(ship_id, updates)
    if logical_stored != work["logical_option"]:
        work["logical_option"] = logical_stored


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def create_sendcloud_shipment(self, shipment_id: int) -> None:
    from django.conf import settings as django_settings
    from django.core.cache import cache
    from .sendcloud_client import SendcloudAPIError, SendcloudClient

    from .models import Shipment
    from .order_shipping import OrderShippingService
    from .parcel_validation import validate_sendcloud_parcel_prerequisites
    from .services import (
        build_sendcloud_order_reference,
        invalidate_shipping_methods_cache,
        patch_shipment_sendcloud_inputs,
        resolve_parcel_shipping_method_id,
        sendcloud_task_work_from_shipment,
    )

    lock_key = f"sendcloud:shipment_task:v1:{shipment_id}"
    ttl = getattr(django_settings, "SENDCLOUD_SHIPMENT_TASK_LOCK_TTL", 900)
    if not cache.add(lock_key, "1", timeout=ttl):
        logger.info(
            "Sendcloud shipment %s: skipped (concurrent task lock)",
            shipment_id,
        )
        return

    def _release_lock() -> None:
        cache.delete(lock_key)

    methods_cache_ttl = getattr(
        django_settings,
        "SENDCLOUD_METHODS_TASK_CACHE_TTL",
        180,
    )

    # --- Step C (part 1): single DB lock, eligibility, idempotent exits ---
    work: dict[str, Any] | None = None
    try:
        with transaction.atomic():
            ship = (
                Shipment.objects.select_for_update()
                .select_related("order")
                .filter(pk=shipment_id)
                .first()
            )
            if ship is None:
                logger.error("Shipment id %s not found", shipment_id)
                return

            if ship.status == Shipment.Status.LABEL_READY:
                return
            if (ship.label_s3_key or "").strip():
                if ship.status != Shipment.Status.LABEL_READY:
                    Shipment.objects.filter(pk=ship.id).update(
                        status=Shipment.Status.LABEL_READY,
                    )
                return

            has_provider_parcel = bool(ship.sendcloud_parcel_id)

            if ship.status in (
                Shipment.Status.CANCELLED,
                Shipment.Status.FAILED_FINAL,
            ):
                return

            order = ship.order
            order.refresh_from_db(
                fields=["status", "is_home_delivery", "address_id"],
            )

            if order.status == "cancelled":
                Shipment.objects.filter(pk=ship.id).update(
                    status=Shipment.Status.CANCELLED,
                    last_error="",
                )
                return

            if not OrderShippingService.requires_courier_shipment(order):
                Shipment.objects.filter(pk=ship.id).update(
                    status=Shipment.Status.CANCELLED,
                    last_error="Order no longer requires courier shipment",
                )
                return

            if order.status != "ready_to_ship":
                logger.info(
                    "Skipping Sendcloud task for shipment %s: order %s status is %s (expected ready_to_ship)",
                    shipment_id,
                    order.pk,
                    order.status,
                )
                return

            if ship.status not in (
                Shipment.Status.QUEUED,
                Shipment.Status.FAILED_RETRYABLE,
                Shipment.Status.PENDING,
                Shipment.Status.CREATING,
                Shipment.Status.LABEL_DOWNLOAD_PENDING,
                Shipment.Status.LABEL_DOWNLOAD_FAILED,
            ):
                logger.info(
                    "Skipping Sendcloud task for shipment %s: status %s",
                    shipment_id,
                    ship.status,
                )
                return

            if not ship.has_courier_snapshot():
                logger.error(
                    "Sendcloud task for shipment %s: incomplete courier snapshot (status=%s)",
                    shipment_id,
                    ship.status,
                )
                Shipment.objects.filter(pk=ship.id).update(
                    status=Shipment.Status.FAILED_FINAL,
                    last_error=(
                        "Incomplete courier snapshot; ensure_shipment must run first."
                    )[:2000],
                )
                return

            p = sendcloud_task_work_from_shipment(ship)
            snap = p["snap"]
            billable_kg = p["billable_kg"]

            Shipment.objects.filter(pk=ship.id).update(
                status=Shipment.Status.CREATING,
            )

            if has_provider_parcel:
                work = {
                    "mode": "download_only",
                    "ship_id": ship.id,
                    "order_id": ship.order_id,
                    "sendcloud_parcel_id": int(ship.sendcloud_parcel_id),
                    "provider_label_url": ship.provider_label_url or "",
                    "parcel_sync": _parcel_sync_dict_from_shipment(ship),
                }
                return

            ref = p["sendcloud_order_reference"]
            if not ref:
                ref = build_sendcloud_order_reference(order)
                patch_shipment_sendcloud_inputs(
                    ship.id, {"sendcloud_order_reference": ref}
                )

            work = {
                "mode": "create",
                "ship_id": ship.id,
                "order_id": ship.order_id,
                "snap": snap,
                "lines": p["lines"],
                "billable_kg": billable_kg,
                "logical_option": p["logical_option"],
                "shipping_method_id": ship.shipping_method_id,
                "sender_address_id": p["sender_address_id"],
                "total_order_value": p["total_order_value"],
                "total_order_value_currency": p["total_order_value_currency"],
                "total_item_quantity": p["total_item_quantity"],
                "sendcloud_order_reference": ref,
            }

        client = SendcloudClient()
        w = work
        if w is None:
            return

        if w["mode"] == "create":
            w_rec = _recover_and_build_download_work(
                client,
                shipment_id=w["ship_id"],
                order_reference=w["sendcloud_order_reference"],
            )
            if w_rec is not None:
                w = w_rec

        if w["mode"] == "download_only":
            _run_download_only_work(client, w)
            return

        # --- Step C (part 2): live methods from Sendcloud (sender context + brief cache) ---
        # Prefer frozen checkout method id (quoted price) when still valid for weight/route.
        to_country = w["snap"].get("country") or "GB"
        to_postal = w["snap"].get("postal_code") or ""

        method_id, logical_stored, method_full_name = resolve_parcel_shipping_method_id(
            client,
            shipping_method_id=w.get("shipping_method_id"),
            logical_option=w["logical_option"],
            sender_address_id=w["sender_address_id"],
            to_country=to_country,
            to_postal_code=to_postal,
            weight_kg=w["billable_kg"],
            cache_ttl=methods_cache_ttl,
            use_checkout_method=True,
        )
        _patch_resolved_shipping_method(
            w["ship_id"], w, logical_stored, method_full_name
        )

        parcel_items = _parcel_items_from_snapshot(w["lines"])

        def _post_parcel(mid: int) -> dict[str, Any]:
            """Single v2 POST /parcels with label (see SendcloudClient.create_parcel)."""
            s = w["snap"]
            validate_sendcloud_parcel_prerequisites(
                address_snapshot=s,
                billable_weight_kg=w["billable_kg"],
                shipping_method_id=int(mid),
                sender_address_id=int(w["sender_address_id"]),
                order_number=w["sendcloud_order_reference"],
                total_order_value=w["total_order_value"],
                total_order_value_currency=w["total_order_value_currency"],
            )
            return client.create_parcel(
                name=s["recipient_name"],
                address=s["address_line"],
                address_2=s.get("address_line2") or "",
                city=s["city"],
                postal_code=s["postal_code"],
                country=s.get("country") or "GB",
                email=s.get("email") or None,
                phone=s.get("phone") or None,
                shipping_method_id=int(mid),
                weight=str(max(w["billable_kg"], 0.01)),
                order_number=w["sendcloud_order_reference"],
                parcel_items=parcel_items or None,
                sender_address=int(w["sender_address_id"]),
                request_label=True,
                total_order_value=w["total_order_value"],
                total_order_value_currency=w["total_order_value_currency"],
            )

        try:
            parcel = _post_parcel_or_recover_download(
                client=client,
                work=w,
                post_fn=lambda: _post_parcel(method_id),
            )
        except SendcloudAPIError as parcel_exc:
            if _is_invalid_shipping_method_error(parcel_exc):
                logger.warning(
                    "Sendcloud rejected shipping method id %s for shipment context; "
                    "clearing methods cache and re-resolving once",
                    method_id,
                    exc_info=True,
                )
                invalidate_shipping_methods_cache(
                    sender_address_id=w["sender_address_id"],
                    to_country=to_country,
                    to_postal_code=to_postal,
                    weight_kg=w["billable_kg"],
                )
                method_id, logical_stored, method_full_name = (
                    resolve_parcel_shipping_method_id(
                        client,
                        shipping_method_id=w.get("shipping_method_id"),
                        logical_option=w["logical_option"],
                        sender_address_id=w["sender_address_id"],
                        to_country=to_country,
                        to_postal_code=to_postal,
                        weight_kg=w["billable_kg"],
                        cache_ttl=methods_cache_ttl,
                        force_refresh=True,
                        use_checkout_method=False,
                    )
                )
                _patch_resolved_shipping_method(
                    w["ship_id"], w, logical_stored, method_full_name
                )
                parcel = _post_parcel_or_recover_download(
                    client=client,
                    work=w,
                    post_fn=lambda: _post_parcel(method_id),
                )
            elif _is_likely_parcel_address_error(parcel_exc):
                from .ideal_postcodes import try_cleanse_uk_address_snapshot

                logger.warning(
                    "Sendcloud parcel error may be address-related; trying Ideal Postcodes cleanse: %s",
                    parcel_exc,
                )
                snap = w["snap"]
                if try_cleanse_uk_address_snapshot(snap):
                    patch_shipment_sendcloud_inputs(
                        w["ship_id"], {"address_snapshot": snap}
                    )
                    to_postal = snap.get("postal_code") or ""
                    invalidate_shipping_methods_cache(
                        sender_address_id=w["sender_address_id"],
                        to_country=to_country,
                        to_postal_code=to_postal,
                        weight_kg=w["billable_kg"],
                    )
                    method_id, logical_stored, method_full_name = (
                        resolve_parcel_shipping_method_id(
                            client,
                            shipping_method_id=w.get("shipping_method_id"),
                            logical_option=w["logical_option"],
                            sender_address_id=w["sender_address_id"],
                            to_country=to_country,
                            to_postal_code=to_postal,
                            weight_kg=w["billable_kg"],
                            cache_ttl=methods_cache_ttl,
                            force_refresh=True,
                            use_checkout_method=True,
                        )
                    )
                    _patch_resolved_shipping_method(
                        w["ship_id"], w, logical_stored, method_full_name
                    )
                    parcel = _post_parcel_or_recover_download(
                        client=client,
                        work=w,
                        post_fn=lambda: _post_parcel(method_id),
                    )
                else:
                    raise
            else:
                raise

        if parcel is None:
            return

        parcel_db_id = parcel.get("id")
        if not parcel_db_id:
            raise SendcloudAPIError("Sendcloud parcel response missing id")

        pid = int(parcel_db_id)
        provider_label_url, _ = resolve_provider_label_and_document_url(parcel)

        tracking = parcel.get("tracking_number") or ""
        tu_raw = parcel.get("tracking_url")
        tracking_url_val = tu_raw.strip()[:600] if isinstance(tu_raw, str) else ""
        carrier_code = ""
        cobj = parcel.get("carrier")
        if isinstance(cobj, dict):
            carrier_code = str(cobj.get("code") or "")

        with transaction.atomic():
            ship_save = Shipment.objects.select_for_update().get(pk=w["ship_id"])
            ship_save.sendcloud_parcel_id = pid
            ship_save.carrier_code = carrier_code
            ship_save.shipping_tracking_number = tracking
            ship_save.shipping_tracking_url = tracking_url_val
            ship_save.provider_label_url = (provider_label_url or "")[:600]
            ship_save.status = Shipment.Status.LABEL_DOWNLOAD_PENDING
            ship_save.last_error = ""
            ship_save.save(
                update_fields=[
                    "sendcloud_parcel_id",
                    "carrier_code",
                    "shipping_tracking_number",
                    "shipping_tracking_url",
                    "provider_label_url",
                    "status",
                    "last_error",
                    "updated_at",
                ]
            )

        pdf_bytes, dl_err, labels_payload = _download_label_pdf_bytes(
            client,
            parcel_id=pid,
            provider_label_url=provider_label_url,
        )
        pl_enr, sp_updates = _enrich_urls_after_labels_fetch(
            provider_label_url=provider_label_url,
            labels_payload=labels_payload,
        )
        label_url_for_sync = pl_enr or label_pdf_url_from_parcel_dict(parcel) or ""
        parcel_sync_min = {
            "id": pid,
            "tracking_number": tracking,
            "tracking_url": tracking_url_val,
            "carrier": {"code": carrier_code} if carrier_code else {},
        }

        with transaction.atomic():
            ship_save = Shipment.objects.select_for_update().get(pk=w["ship_id"])
            _apply_shipment_label_storage(
                ship_save,
                pdf_bytes=pdf_bytes,
                dl_err=dl_err,
                parcel_dict_for_sync=parcel_sync_min,
                label_url_for_sync=label_url_for_sync,
                parcel_url_updates=sp_updates or None,
            )

    except ValueError as exc:
        logger.error(
            "Sendcloud parcel preconditions failed for shipment %s: %s",
            shipment_id,
            exc,
        )
        Shipment.objects.filter(pk=shipment_id).update(
            status=Shipment.Status.FAILED_FINAL,
            last_error=str(exc)[:2000],
        )
        return
    except SendcloudAPIError as exc:
        if _is_sendcloud_announce_forbidden_error(exc):
            msg = _friendly_sendcloud_announce_forbidden_message()
            logger.error("Shipment %s: %s Original: %s", shipment_id, msg, exc)
            Shipment.objects.filter(pk=shipment_id).update(
                status=Shipment.Status.FAILED_FINAL,
                last_error=msg[:2000],
            )
            return
        logger.exception("Sendcloud error for shipment %s", shipment_id)
        err = str(exc)[:2000]
        if self.request.retries < self.max_retries:
            Shipment.objects.filter(pk=shipment_id).update(
                status=Shipment.Status.FAILED_RETRYABLE,
                last_error=err,
                retry_count=F("retry_count") + 1,
            )
            raise self.retry(exc=exc) from exc
        Shipment.objects.filter(pk=shipment_id).update(
            status=Shipment.Status.FAILED_FINAL,
            last_error=err,
        )
        raise
    except Exception as exc:
        logger.exception("Unexpected error for shipment %s", shipment_id)
        err = str(exc)[:2000]
        if self.request.retries < self.max_retries:
            Shipment.objects.filter(pk=shipment_id).update(
                status=Shipment.Status.FAILED_RETRYABLE,
                last_error=err,
                retry_count=F("retry_count") + 1,
            )
            raise self.retry(exc=exc) from exc
        Shipment.objects.filter(pk=shipment_id).update(
            status=Shipment.Status.FAILED_FINAL,
            last_error=err,
        )
        raise

    finally:
        _release_lock()
