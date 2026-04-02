import logging

from django.db.models.signals import post_save, pre_delete, pre_save
from django.dispatch import receiver

from api.models import Order

from .models import Shipment
from .order_shipping import OrderShippingService

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Order, dispatch_uid="shipping.stash_order_status_before_save")
def stash_order_status_before_save(sender, instance, **kwargs) -> None:
    """
    Capture persisted ``status`` before write so ``post_save`` can detect transitions
    into ``ready_to_ship`` without extra work when ``status`` is not part of this save.

    Skips a DB read when ``save(update_fields=...)`` omits ``status`` — the row’s
    status is unchanged, so the effective prior value is ``instance.status`` (callers
    that mutate ``status`` must include ``"status"`` in ``update_fields``). Fixture
    loads (``raw=True``) also skip the query.
    """
    if kwargs.get("raw"):
        # Loaddata: avoid SELECT; treat row as internally consistent for transition check.
        instance._order_previous_status = instance.status
        return
    if not instance.pk:
        instance._order_previous_status = None
        return
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and "status" not in update_fields:
        instance._order_previous_status = instance.status
        return
    instance._order_previous_status = (
        Order.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    )


@receiver(post_save, sender=Order, dispatch_uid="shipping.on_ready_to_ship_transition")
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


def _delete_shipment_label_from_s3(instance: Shipment) -> None:
    """Remove stored label PDF from S3 (best-effort; DB delete still proceeds on failure)."""
    key = (getattr(instance, "label_s3_key", None) or "").strip()
    if not key:
        return
    from django.conf import settings

    from botocore.exceptions import ClientError

    from billing.models import get_s3_client

    bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", None) or ""
    if not bucket:
        logger.warning(
            "Shipment pk=%s: skip S3 label delete (AWS_STORAGE_BUCKET_NAME unset), key=%s",
            instance.pk,
            key,
        )
        return
    try:
        s3 = get_s3_client()
        s3.delete_object(Bucket=bucket, Key=key)
        logger.info(
            "Deleted label S3 object %s for Shipment pk=%s",
            key,
            instance.pk,
        )
    except ClientError as exc:
        logger.warning(
            "S3 delete_object failed for label key=%s (Shipment pk=%s): %s",
            key,
            instance.pk,
            exc,
        )
    except Exception as exc:
        logger.warning(
            "S3 label delete error key=%s (Shipment pk=%s): %s",
            key,
            instance.pk,
            exc,
        )


@receiver(
    pre_delete,
    sender=Shipment,
    dispatch_uid="shipping.cancel_sendcloud_parcel_before_shipment_delete",
)
def cancel_sendcloud_parcel_before_shipment_delete(sender, instance, **kwargs) -> None:
    """
    Before ``Shipment`` row removal: cancel Sendcloud parcel (if any) and delete
    the label PDF from S3 when ``label_s3_key`` is set.
    """
    pid = getattr(instance, "sendcloud_parcel_id", None)
    if pid:
        from .sendcloud_client import SendcloudClient

        try:
            client = SendcloudClient()
        except ValueError as exc:
            logger.warning(
                "Shipment pk=%s sendcloud_parcel_id=%s: skip remote cancel "
                "(Sendcloud not configured): %s",
                instance.pk,
                pid,
                exc,
            )
        else:
            if client.cancel_parcel(int(pid)):
                logger.info(
                    "Cancelled Sendcloud parcel %s before deleting Shipment pk=%s",
                    pid,
                    instance.pk,
                )
            else:
                logger.warning(
                    "Sendcloud cancel failed for parcel %s (Shipment pk=%s); "
                    "deleting local row anyway — check Sendcloud panel.",
                    pid,
                    instance.pk,
                )

    _delete_shipment_label_from_s3(instance)
