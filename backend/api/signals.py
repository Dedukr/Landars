"""
Keep denormalised product sales counters aligned with orders and lines.

Rebuilds are batched per DB transaction (see ``schedule_product_sales_rebuild``).
Bulk status changes should use ``Order.objects.update(status=...)`` or
``bulk_set_order_status`` (``OrderQuerySet`` schedules rebuilds automatically).
"""

import logging

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from api.models import Order, OrderItem
from api.services.product_sales import (
    collect_product_ids_for_order,
    schedule_product_sales_rebuild,
)

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=OrderItem, dispatch_uid="api.orderitem_stash_product_for_sales")
def orderitem_stash_product_for_sales(sender, instance, **kwargs):
    """Detect product FK changes so we can rebuild counters for the old product too."""
    if not instance.pk:
        instance._sales_prev_product_id = None
        return
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and "product_id" not in update_fields:
        instance._sales_prev_product_id = instance.product_id
        return
    instance._sales_prev_product_id = (
        OrderItem.objects.filter(pk=instance.pk).values_list("product_id", flat=True).first()
    )


@receiver(post_save, sender=OrderItem, dispatch_uid="api.orderitem_schedule_sales_rebuild")
def orderitem_schedule_sales_rebuild(sender, instance, **kwargs):
    ids: list[int] = []
    if instance.product_id:
        ids.append(int(instance.product_id))
    prev = getattr(instance, "_sales_prev_product_id", None)
    if prev is not None and prev != instance.product_id:
        ids.append(int(prev))
    schedule_product_sales_rebuild(ids)


@receiver(post_delete, sender=OrderItem, dispatch_uid="api.orderitem_delete_schedule_sales")
def orderitem_delete_schedule_sales(sender, instance, **kwargs):
    if instance.product_id:
        schedule_product_sales_rebuild([int(instance.product_id)])


@receiver(pre_save, sender=Order, dispatch_uid="api.order_stash_status_for_sales")
def order_stash_status_for_sales(sender, instance, **kwargs):
    """Remember persisted status so post_save can skip no-op rebuilds."""
    if kwargs.get("raw"):
        instance._sales_prev_order_status = instance.status
        return
    if not instance.pk:
        instance._sales_prev_order_status = None
        return
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and "status" not in update_fields:
        instance._sales_prev_order_status = instance.status
        return
    instance._sales_prev_order_status = (
        Order.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    )


@receiver(post_save, sender=Order, dispatch_uid="api.order_schedule_sales_on_status_change")
def order_schedule_sales_on_status_change(sender, instance, **kwargs):
    """Refresh line products only when order status may affect sold totals."""
    previous = getattr(instance, "_sales_prev_order_status", None)
    if previous == instance.status:
        return
    try:
        schedule_product_sales_rebuild(collect_product_ids_for_order(instance))
    except Exception:
        logger.exception(
            "order_schedule_sales_on_status_change failed for order_id=%s",
            getattr(instance, "pk", None),
        )
