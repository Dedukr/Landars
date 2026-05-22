"""
Keep denormalised product sales counters aligned with orders and lines.

Admin ``queryset.update(...)`` bypasses these handlers — run
``python manage.py recalculate_product_sales_counters`` after bulk SQL updates.
"""

import logging

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from api.models import Order, OrderItem
from api.services.product_sales import (
    collect_product_ids_for_order,
    rebuild_product_sales_counters,
)

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=OrderItem, dispatch_uid="api.orderitem_stash_product_for_sales")
def orderitem_stash_product_for_sales(sender, instance, **kwargs):
    """Detect product FK changes so we can rebuild counters for the old product too."""
    if not instance.pk:
        instance._sales_prev_product_id = None
        return
    instance._sales_prev_product_id = (
        OrderItem.objects.filter(pk=instance.pk).values_list("product_id", flat=True).first()
    )


@receiver(post_save, sender=OrderItem, dispatch_uid="api.orderitem_rebuild_sales_counters")
def orderitem_rebuild_sales_counters(sender, instance, **kwargs):
    ids: list[int] = []
    if instance.product_id:
        ids.append(int(instance.product_id))
    prev = getattr(instance, "_sales_prev_product_id", None)
    if prev is not None and prev != instance.product_id:
        ids.append(int(prev))
    rebuild_product_sales_counters(ids)


@receiver(post_delete, sender=OrderItem, dispatch_uid="api.orderitem_delete_rebuild_sales")
def orderitem_delete_rebuild_sales(sender, instance, **kwargs):
    if instance.product_id:
        rebuild_product_sales_counters([int(instance.product_id)])


@receiver(post_save, sender=Order, dispatch_uid="api.order_rebuild_sales_counters")
def order_rebuild_sales_counters(sender, instance, **kwargs):
    """Status / payment changes: refresh every product still on this order."""
    try:
        pids = collect_product_ids_for_order(instance)
        rebuild_product_sales_counters(pids)
    except Exception:
        logger.exception(
            "order_rebuild_sales_counters failed for order_id=%s", getattr(instance, "pk", None)
        )
