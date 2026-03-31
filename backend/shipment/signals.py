import logging

from django.db.models.signals import post_save, pre_delete, pre_save
from django.dispatch import receiver

from api.models import Order

from .models import ShipmentParcel
from .order_shipping import OrderShippingService

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Order, dispatch_uid="shipment.stash_order_status_before_save")
def stash_order_status_before_save(sender, instance, **kwargs) -> None:
    """Capture DB status before write so we can detect real transitions in post_save."""
    if not instance.pk:
        instance._order_previous_status = None
        return
    previous = (
        Order.objects.filter(pk=instance.pk)
        .values_list("status", flat=True)
        .first()
    )
    instance._order_previous_status = previous


@receiver(post_save, sender=Order, dispatch_uid="shipment.on_ready_to_ship_transition")
def on_order_transition_ready_to_ship(sender, instance, **kwargs) -> None:
    """
    When the order *transitions into* ``ready_to_ship``, freeze a Shipment snapshot
    and enqueue Sendcloud. Not fired on unrelated saves while already ready_to_ship.
    """
    previous = getattr(instance, "_order_previous_status", None)
    if instance.status != "ready_to_ship":
        return
    if previous == "ready_to_ship":
        return

    result = OrderShippingService.ensure_shipment(instance)
    if result.task_queued and result.shipment:
        logger.info(
            "Queued Sendcloud task for shipment %s (order %s)",
            result.shipment.pk,
            instance.pk,
        )
    elif not result.task_queued and result.shipment is None:
        logger.info(
            "Order %s ready_to_ship: no shipment queued (see ensure_shipment logs)",
            instance.pk,
        )
    elif result.shipment and not result.task_queued:
        logger.info(
            "Order %s ready_to_ship: shipment %s already complete or terminal — not re-queued",
            instance.pk,
            result.shipment.pk,
        )


@receiver(
    pre_delete,
    sender=ShipmentParcel,
    dispatch_uid="shipment.cancel_sendcloud_parcel_before_delete",
)
def cancel_sendcloud_parcel_before_delete(sender, instance, **kwargs) -> None:
    """
    POST /parcels/{id}/cancel at Sendcloud before the DB row is removed
    (including when ``Shipment`` delete cascades to ``ShipmentParcel``).
    """
    pid = getattr(instance, "sendcloud_parcel_id", None)
    if not pid:
        return
    from shipping.sendcloud_client import SendcloudClient

    try:
        client = SendcloudClient()
    except ValueError as exc:
        logger.warning(
            "ShipmentParcel pk=%s sendcloud_parcel_id=%s: skip remote cancel "
            "(Sendcloud not configured): %s",
            instance.pk,
            pid,
            exc,
        )
        return
    if client.cancel_parcel(int(pid)):
        logger.info(
            "Cancelled Sendcloud parcel %s before deleting ShipmentParcel pk=%s",
            pid,
            instance.pk,
        )
    else:
        logger.warning(
            "Sendcloud cancel failed for parcel %s (ShipmentParcel pk=%s); "
            "deleting local row anyway — check Sendcloud panel.",
            pid,
            instance.pk,
        )
