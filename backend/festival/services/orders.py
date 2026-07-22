from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction

from festival.models import (
    FestivalAddition,
    FestivalFilling,
    FestivalOrder,
    FestivalOrderItem,
    FestivalPrintJob,
    FestivalProduct,
)
from festival.services.cloudprnt import (
    create_print_batch,
    get_active_printer,
    printer_status_payload,
)
from festival.services.documents import create_paid_invoice
from festival.services.numbering import allocate_ticket_number
from festival.services.pricing import price_line, price_order
from festival.services.tickets import render_customer_ticket, render_kitchen_ticket

logger = logging.getLogger(__name__)


class FestivalOrderError(Exception):
    def __init__(self, message: str, *, code: str = "invalid", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass
class PlaceOrderResult:
    order: FestivalOrder
    replayed: bool


def _max_item_qty() -> int:
    return int(getattr(settings, "FESTIVAL_MAX_ITEM_QUANTITY", 99))


def _optional_id(raw_value, *, field: str) -> int | None:
    if raw_value is None or raw_value == "":
        return None
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise FestivalOrderError(
            f"{field} must be an integer when provided."
        ) from exc
    if value < 1:
        raise FestivalOrderError(f"{field} must be at least 1.")
    return value


def normalize_items(items: list[dict]) -> list[dict]:
    if not items:
        raise FestivalOrderError("Order must contain at least one item.")
    normalized: dict[tuple[int, int | None, int | None], int] = {}
    for raw in items:
        try:
            product_id = int(raw["product_id"])
            quantity = int(raw["quantity"])
        except (KeyError, TypeError, ValueError) as exc:
            raise FestivalOrderError(
                "Each item requires integer product_id and quantity."
            ) from exc
        filling_id = _optional_id(raw.get("filling_id"), field="filling_id")
        addition_id = _optional_id(raw.get("addition_id"), field="addition_id")
        if quantity < 1:
            raise FestivalOrderError("Item quantity must be at least 1.")
        if quantity > _max_item_qty():
            raise FestivalOrderError(
                f"Item quantity cannot exceed {_max_item_qty()}."
            )
        key = (product_id, filling_id, addition_id)
        normalized[key] = normalized.get(key, 0) + quantity
        if normalized[key] > _max_item_qty():
            raise FestivalOrderError(
                f"Item quantity cannot exceed {_max_item_qty()}."
            )
    return [
        {
            "product_id": product_id,
            "filling_id": filling_id,
            "addition_id": addition_id,
            "quantity": qty,
        }
        for (product_id, filling_id, addition_id), qty in sorted(
            normalized.items(),
            key=lambda pair: (pair[0][0], pair[0][1] or 0, pair[0][2] or 0),
        )
    ]


def request_fingerprint(normalized_items: list[dict]) -> str:
    payload = json.dumps(normalized_items, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _ensure_can_place(user) -> None:
    if not getattr(settings, "FESTIVAL_ENABLED", False):
        raise FestivalOrderError(
            "Festival ordering is disabled.",
            code="disabled",
            status=503,
        )
    if not user or not user.is_authenticated:
        raise FestivalOrderError("Authentication required.", status=401)
    if not user.is_staff:
        raise FestivalOrderError("Staff access required.", status=403)
    if not (
        user.is_superuser
        or user.has_perm("festival.place_festival_order")
    ):
        raise FestivalOrderError(
            "Missing festival order permission.",
            status=403,
        )


def _ensure_printer_available() -> None:
    status = printer_status_payload()
    mode = status["mode"]
    if mode != "cloudprnt":
        return
    require = bool(getattr(settings, "FESTIVAL_PRINTER_REQUIRED", True))
    allow_offline = bool(
        getattr(settings, "FESTIVAL_ALLOW_ORDERS_WHEN_PRINTER_OFFLINE", False)
    )
    if not require or allow_offline:
        return
    if not get_active_printer():
        raise FestivalOrderError(
            "No active festival printer is configured.",
            code="printer_missing",
            status=503,
        )
    if not status["online"]:
        raise FestivalOrderError(
            "Festival printer is offline. Orders cannot be accepted right now.",
            code="printer_offline",
            status=503,
        )


def place_festival_order(
    *,
    user,
    client_request_id: uuid.UUID | str,
    items: list[dict],
) -> PlaceOrderResult:
    _ensure_can_place(user)
    try:
        request_id = uuid.UUID(str(client_request_id))
    except (TypeError, ValueError) as exc:
        raise FestivalOrderError("client_request_id must be a valid UUID.") from exc

    normalized = normalize_items(items)
    fingerprint = request_fingerprint(normalized)

    existing = FestivalOrder.objects.filter(client_request_id=request_id).first()
    if existing:
        if (
            existing.created_by_id == user.id
            and existing.request_fingerprint == fingerprint
        ):
            return PlaceOrderResult(order=existing, replayed=True)
        raise FestivalOrderError(
            "Idempotency key conflict: request already used with a different payload.",
            code="idempotency_conflict",
            status=409,
        )

    _ensure_printer_available()

    product_ids = [row["product_id"] for row in normalized]
    filling_ids = [
        row["filling_id"] for row in normalized if row["filling_id"] is not None
    ]
    addition_ids = [
        row["addition_id"] for row in normalized if row["addition_id"] is not None
    ]
    with transaction.atomic():
        products = {
            p.id: p
            for p in FestivalProduct.objects.select_for_update(of=("self",)).filter(
                id__in=product_ids, is_active=True
            )
        }
        missing = [pid for pid in product_ids if pid not in products]
        if missing:
            raise FestivalOrderError(
                f"Inactive or unknown products: {missing}.",
                code="inactive_product",
            )

        fillings = {
            f.id: f
            for f in FestivalFilling.objects.select_for_update(of=("self",)).filter(
                id__in=filling_ids
            )
        }
        missing_fillings = [
            fid for fid in filling_ids if fid not in fillings
        ]
        if missing_fillings:
            raise FestivalOrderError(
                f"Unknown fillings: {missing_fillings}.",
                code="invalid_filling",
            )

        products_with_fillings = set(
            FestivalFilling.objects.filter(
                product_id__in=product_ids, is_active=True
            ).values_list("product_id", flat=True)
        )

        additions = {
            a.id: a
            for a in FestivalAddition.objects.select_for_update(of=("self",)).filter(
                id__in=addition_ids
            )
        }
        missing_additions = [
            aid for aid in addition_ids if aid not in additions
        ]
        if missing_additions:
            raise FestivalOrderError(
                f"Unknown additions: {missing_additions}.",
                code="invalid_addition",
            )

        priced_lines = []
        resolved_lines = []
        for row in normalized:
            product = products[row["product_id"]]
            filling_id = row["filling_id"]
            addition_id = row["addition_id"]
            filling = None
            filling_name = ""
            addition = None
            addition_name = ""
            addition_unit_price = Decimal("0.00")

            if product.id in products_with_fillings:
                if filling_id is None:
                    raise FestivalOrderError(
                        f"Product {product.id} requires a filling_id.",
                        code="filling_required",
                    )
                filling = fillings[filling_id]
                if filling.product_id != product.id:
                    raise FestivalOrderError(
                        f"Filling {filling_id} does not belong to product "
                        f"{product.id}.",
                        code="invalid_filling",
                    )
                if not filling.is_active:
                    raise FestivalOrderError(
                        f"Filling {filling_id} is inactive.",
                        code="invalid_filling",
                    )
                filling_name = filling.name
            elif filling_id is not None:
                raise FestivalOrderError(
                    f"Product {product.id} does not accept a filling.",
                    code="invalid_filling",
                )

            if product.addition_class_id:
                if addition_id is None:
                    raise FestivalOrderError(
                        f"Product {product.id} requires an addition_id.",
                        code="addition_required",
                    )
                addition = additions[addition_id]
                if addition.addition_class_id != product.addition_class_id:
                    raise FestivalOrderError(
                        f"Addition {addition_id} does not belong to product "
                        f"{product.id}'s addition class.",
                        code="invalid_addition",
                    )
                addition_name = addition.name
                addition_unit_price = addition.price
            elif addition_id is not None:
                raise FestivalOrderError(
                    f"Product {product.id} does not accept an addition.",
                    code="invalid_addition",
                )

            unit_gross = product.price + addition_unit_price
            priced_lines.append(
                price_line(
                    product_id=product.id,
                    product_name=product.name,
                    quantity=row["quantity"],
                    unit_gross=unit_gross,
                    vat_rate_percent=product.vat_rate,
                )
            )
            resolved_lines.append(
                {
                    "product_id": product.id,
                    "filling_id": filling.id if filling else None,
                    "filling_name": filling_name,
                    "addition_id": addition.id if addition else None,
                    "addition_name": addition_name,
                    "addition_unit_price": addition_unit_price,
                    "quantity": row["quantity"],
                }
            )
        pricing = price_order(priced_lines)

        printer = get_active_printer()
        mode = getattr(settings, "FESTIVAL_PRINT_MODE", "disabled")
        # Print jobs are queued only when an active printer exists; missing
        # printers are already gated by _ensure_printer_available().

        ticket = allocate_ticket_number()
        try:
            order = FestivalOrder.objects.create(
                order_number=ticket.order_number,
                total_price=pricing.total_gross,
                client_request_id=request_id,
                request_fingerprint=fingerprint,
                status=FestivalOrder.Status.PAID,
                created_by=user,
            )
        except IntegrityError:
            # Concurrent duplicate client_request_id.
            existing = FestivalOrder.objects.get(client_request_id=request_id)
            if (
                existing.created_by_id == user.id
                and existing.request_fingerprint == fingerprint
            ):
                return PlaceOrderResult(order=existing, replayed=True)
            raise FestivalOrderError(
                "Idempotency key conflict.",
                code="idempotency_conflict",
                status=409,
            )

        for line, resolved in zip(pricing.lines, resolved_lines, strict=True):
            FestivalOrderItem.objects.create(
                order=order,
                product_id=line.product_id,
                filling_id=resolved["filling_id"],
                addition_id=resolved["addition_id"],
                quantity=line.quantity,
                product_name=line.product_name,
                filling_name=resolved["filling_name"],
                addition_name=resolved["addition_name"],
                addition_unit_price=resolved["addition_unit_price"],
                unit_price=line.unit_price,
                vat_rate=line.vat_rate,
                line_net=line.line_net,
                line_vat=line.line_vat,
                line_total=line.line_total,
            )

        invoice = create_paid_invoice(order=order, pricing=pricing)

        if mode == "cloudprnt" and printer:
            kitchen = render_kitchen_ticket(order)
            customer = render_customer_ticket(order, invoice)
            create_print_batch(
                order=order,
                printer=printer,
                jobs=[
                    (FestivalPrintJob.JobType.KITCHEN, 1, kitchen),
                    (FestivalPrintJob.JobType.CUSTOMER, 2, customer),
                ],
            )

        order_id = order.pk
        invoice_id = invoice.pk

        def enqueue_pdf():
            from festival.tasks import generate_festival_invoice_pdf_task

            try:
                generate_festival_invoice_pdf_task.delay(invoice_id)
            except Exception:
                logger.exception(
                    "Failed to enqueue festival invoice PDF for invoice %s",
                    invoice_id,
                )

        transaction.on_commit(enqueue_pdf)

    order = FestivalOrder.objects.select_related("invoice").prefetch_related(
        "items", "print_jobs"
    ).get(pk=order_id)
    logger.info(
        "Festival order created id=%s ticket=%s total=%s by=%s",
        order.pk,
        order.order_number,
        order.total_price,
        user.pk,
    )
    return PlaceOrderResult(order=order, replayed=False)


def order_print_status(order: FestivalOrder) -> str:
    jobs = list(order.print_jobs.all())
    if not jobs:
        mode = getattr(settings, "FESTIVAL_PRINT_MODE", "disabled")
        return "disabled" if mode == "disabled" else "queued"
    if any(j.status == FestivalPrintJob.Status.FAILED for j in jobs):
        return "failed"
    if all(j.status == FestivalPrintJob.Status.PRINTED for j in jobs):
        return "printed"
    if any(j.status == FestivalPrintJob.Status.CLAIMED for j in jobs):
        return "printing"
    return "queued"
