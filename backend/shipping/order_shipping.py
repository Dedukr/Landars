from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import IntegrityError, transaction

if TYPE_CHECKING:
    from api.models import Order

    from shipping.models import Shipment

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EnsureShipmentResult:
    """Result of ``ensure_shipment`` (idempotent create + optional Celery enqueue)."""

    shipment: Shipment | None
    created: bool
    task_queued: bool


class OrderShippingService:
    """Domain entrypoints for courier (post) outbound shipments."""

    TERMINAL_SHIPMENT_STATUSES_FROZEN = frozenset(
        {"label_ready", "failed_final", "cancelled"}
    )

    @classmethod
    def _shipment_needs_sendcloud_task(cls, shipment: Shipment) -> bool:
        """False when cancelled, terminal failure, or label already stored under LABEL_READY."""
        from .models import Shipment

        if shipment.status in (
            Shipment.Status.CANCELLED,
            Shipment.Status.FAILED_FINAL,
        ):
            return False
        if (
            shipment.status == Shipment.Status.LABEL_READY
            and shipment.is_label_fully_stored()
        ):
            return False
        return True

    @staticmethod
    def requires_courier_shipment(order: Order) -> bool:
        """True when fulfillment needs a parcel carrier (non–home delivery) with a resolvable address."""
        if order.is_home_delivery:
            return False
        return order.get_delivery_address() is not None

    @staticmethod
    def transition_to_ready_to_ship(order: Order) -> bool:
        """
        For a paid order that needs courier shipment, move to ``ready_to_ship``.

        This explicit transition is what downstream code should use after payment
        (or when ops release the order); snapshot creation runs on transition only.
        """
        if order.status != "paid":
            return False
        if not OrderShippingService.requires_courier_shipment(order):
            return False
        order.status = "ready_to_ship"
        order.save(update_fields=["status"])
        return True

    @classmethod
    def schedule_sendcloud_task(cls, shipment_pk: int) -> bool:
        """
        Mark shipment ``queued`` (after commit) and enqueue Celery. Skips terminal rows.
        Use for admin/manual retries so work runs only after any status update commits.
        """
        from .models import Shipment
        from .tasks import create_sendcloud_shipment

        sid = shipment_pk
        with transaction.atomic():
            row = (
                Shipment.objects.select_for_update()
                .filter(pk=sid)
                .exclude(status__in=cls.TERMINAL_SHIPMENT_STATUSES_FROZEN)
                .first()
            )
            if row is None:
                return False
            Shipment.objects.filter(pk=sid).update(status=Shipment.Status.QUEUED)
        transaction.on_commit(lambda s=sid: create_sendcloud_shipment.delay(s))
        return True

    @classmethod
    def admin_queue_label_download_retry(cls, shipment_pk: int) -> tuple[bool, str]:
        """
        Ops: queue Celery to download/store the label only (Sendcloud parcel must exist).

        Re-opens ``failed_final`` / ``failed_retryable`` when a parcel row exists so storage
        can be retried without POST /parcels again.
        """
        from .models import Shipment
        from .tasks import create_sendcloud_shipment

        sid = shipment_pk
        ship = Shipment.objects.filter(pk=sid).first()
        if ship is None:
            return False, "Shipment not found."
        if ship.status == Shipment.Status.CANCELLED:
            return False, "Shipment is cancelled."
        if not ship.sendcloud_parcel_id:
            return (
                False,
                "No Sendcloud parcel on file. Use “Retry shipment creation” first.",
            )
        if ship.is_label_fully_stored():
            return False, "Label PDF is already stored locally."

        with transaction.atomic():
            row = Shipment.objects.select_for_update().filter(pk=sid).first()
            if row is None:
                return False, "Shipment not found."
            if row.status == Shipment.Status.CANCELLED:
                return False, "Shipment is cancelled."
            if row.status == Shipment.Status.LABEL_READY and row.is_label_fully_stored():
                return False, "Shipment is already complete."
            Shipment.objects.filter(pk=sid).update(
                status=Shipment.Status.QUEUED,
                last_error="",
            )
        transaction.on_commit(lambda: create_sendcloud_shipment.delay(sid))
        return True, "Label download task has been queued."

    @classmethod
    def admin_queue_shipment_creation_retry(cls, shipment_pk: int) -> tuple[bool, str]:
        """Ops: queue Celery to create the Sendcloud parcel (only if no parcel row yet)."""
        from .models import Shipment

        sid = shipment_pk
        if Shipment.objects.filter(pk=sid, sendcloud_parcel_id__isnull=False).exclude(
            sendcloud_parcel_id=0
        ).exists():
            return (
                False,
                "A Sendcloud parcel already exists. Use “Retry label download” for the PDF.",
            )
        with transaction.atomic():
            ship = Shipment.objects.select_for_update().filter(pk=sid).first()
            if ship is None:
                return False, "Shipment not found."
            if ship.status == Shipment.Status.CANCELLED:
                return False, "Shipment is cancelled."
            if ship.status == Shipment.Status.LABEL_READY:
                return False, "Shipment is already complete."
            if ship.status == Shipment.Status.FAILED_FINAL:
                Shipment.objects.filter(pk=sid).update(
                    status=Shipment.Status.QUEUED,
                    last_error="",
                )
            elif ship.status in cls.TERMINAL_SHIPMENT_STATUSES_FROZEN:
                return False, "Cannot retry shipment creation from this status."
        if not cls.schedule_sendcloud_task(sid):
            return False, "Could not queue task."
        return True, "Shipment creation task has been queued."

    @classmethod
    def admin_recreate_sendcloud_parcel_from_order(
        cls, shipment_pk: int
    ) -> tuple[bool, str]:
        """
        After a parcel was cancelled in Sendcloud (or local row is stale): clear provider
        parcel fields on ``Shipment``, re-freeze snapshot + weight from the **current** order,
        assign a **new** ``sendcloud_order_reference``, clear label fields, queue create.

        Requires the order to be ``ready_to_ship`` and courier-eligible.
        """
        from .models import Shipment
        from .services import build_shipment_snapshot, unique_sendcloud_order_reference_for_recreate

        sid = shipment_pk
        try:
            with transaction.atomic():
                ship = (
                    Shipment.objects.select_for_update()
                    .select_related("order")
                    .filter(pk=sid)
                    .first()
                )
                if ship is None:
                    return False, "Shipment not found."
                if ship.status == Shipment.Status.CANCELLED:
                    return False, "Shipment is cancelled locally — un-cancel or create a new flow."
                order = ship.order
                if order.status != "ready_to_ship":
                    return (
                        False,
                        f"Order must be ready_to_ship (currently {order.status!r}).",
                    )
                if not cls.requires_courier_shipment(order):
                    return False, "Order no longer requires courier shipment."

                ship.sendcloud_parcel_id = None
                ship.carrier_code = ""
                ship.shipping_tracking_number = None
                ship.shipping_tracking_url = None
                ship.provider_label_url = ""

                try:
                    snapshot = build_shipment_snapshot(order)
                except ValueError as exc:
                    return False, f"Cannot rebuild snapshot: {exc}"

                inputs = dict(snapshot.get("sendcloud_inputs") or {})
                inputs["sendcloud_order_reference"] = (
                    unique_sendcloud_order_reference_for_recreate(order, ship.pk)
                )
                snapshot["sendcloud_inputs"] = inputs

                for key, val in snapshot.items():
                    setattr(ship, key, val)

                ship.label_s3_key = ""
                ship.last_error = ""
                ship.retry_count = 0
                ship.status = Shipment.Status.QUEUED
                ship.save()

            if not cls.schedule_sendcloud_task(sid):
                return (
                    False,
                    "Snapshot updated but task could not be queued (check shipment status).",
                )
            return (
                True,
                "Local parcel removed; snapshot refreshed from order; new Sendcloud "
                "order_number set; creation task queued.",
            )
        except Exception as exc:
            logger.exception("admin_recreate_sendcloud_parcel_from_order failed")
            return False, str(exc)[:500]

    @classmethod
    def ensure_shipment(cls, order: Order) -> EnsureShipmentResult:
        """
        Create the frozen outbound ``Shipment`` row if needed (DB idempotent) and
        queue Sendcloud. Call when the order is already ``ready_to_ship``.
        """
        from .models import Shipment
        from .services import build_shipment_snapshot
        from .tasks import create_sendcloud_shipment

        if order.status != "ready_to_ship":
            return EnsureShipmentResult(None, False, False)
        if not cls.requires_courier_shipment(order):
            logger.info(
                "ensure_shipment skipped order %s: courier shipment not required "
                "(is_home_delivery=%s order.address_id=%s, resolved delivery address=%s)",
                order.pk,
                order.is_home_delivery,
                order.address_id,
                "yes" if order.get_delivery_address() else "no",
            )
            return EnsureShipmentResult(None, False, False)

        try:
            snapshot = build_shipment_snapshot(order)
        except ValueError as exc:
            logger.warning(
                "Shipment snapshot skipped for order %s: %s",
                order.pk,
                exc,
            )
            return EnsureShipmentResult(None, False, False)

        shipment: Shipment | None = None
        created = False
        queued_existing = False

        try:
            with transaction.atomic():
                existing = (
                    Shipment.objects.select_for_update()
                    .filter(order_id=order.pk)
                    .first()
                )
                if existing is not None:
                    shipment = existing
                    if not existing.has_courier_snapshot():
                        for key, val in snapshot.items():
                            setattr(existing, key, val)
                        existing.status = Shipment.Status.QUEUED
                        existing.save()
                        sid = existing.pk
                        transaction.on_commit(
                            lambda s=sid: create_sendcloud_shipment.delay(s)
                        )
                        return EnsureShipmentResult(existing, False, True)
                    if cls._shipment_needs_sendcloud_task(existing):
                        sid = existing.pk
                        transaction.on_commit(
                            lambda s=sid: create_sendcloud_shipment.delay(s)
                        )
                        queued_existing = True
                    else:
                        logger.info(
                            "ensure_shipment order %s: shipment %s needs no task (status=%s)",
                            order.pk,
                            existing.pk,
                            existing.status,
                        )
                    return EnsureShipmentResult(
                        shipment, False, queued_existing
                    )

                shipment = Shipment.objects.create(
                    order=order,
                    status=Shipment.Status.PENDING,
                    **snapshot,
                )
                Shipment.objects.filter(pk=shipment.pk).update(
                    status=Shipment.Status.QUEUED,
                )
                shipment.status = Shipment.Status.QUEUED
                sid = shipment.pk
                transaction.on_commit(
                    lambda s=sid: create_sendcloud_shipment.delay(s)
                )
                created = True
        except IntegrityError:
            # Another transaction won the unique race on ``order``; our inner atomic
            # rolled back. Still respect any outer atomic: never enqueue Celery until
            # this request's transaction commits (same as the success paths above).
            shipment = Shipment.objects.filter(order_id=order.pk).first()
            if shipment is None:
                raise
            if not shipment.has_courier_snapshot():
                try:
                    snap = build_shipment_snapshot(order)
                    for key, val in snap.items():
                        setattr(shipment, key, val)
                    shipment.status = Shipment.Status.QUEUED
                    shipment.save()
                except ValueError:
                    return EnsureShipmentResult(shipment, False, False)
            needs_task = cls._shipment_needs_sendcloud_task(shipment)
            if needs_task:
                sid = shipment.pk
                transaction.on_commit(
                    lambda s=sid: create_sendcloud_shipment.delay(s)
                )
            return EnsureShipmentResult(shipment, False, needs_task)

        if created and shipment is not None:
            return EnsureShipmentResult(shipment, True, True)

        return EnsureShipmentResult(None, False, False)
