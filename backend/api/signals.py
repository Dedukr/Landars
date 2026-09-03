"""
Keep denormalised product sales counters aligned with orders and lines.

Rebuilds are batched per DB transaction (see ``schedule_product_sales_rebuild``).
Bulk status changes should use ``Order.objects.update(status=...)`` or
``bulk_set_order_status`` (``OrderQuerySet`` schedules rebuilds automatically).
"""

import logging

from django.core.cache import cache
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save
from django.dispatch import receiver

<<<<<<< HEAD
from api.models import CategoryGroup, Order, OrderItem, Product, ProductCategory
from api.views import (
    DEFAULT_PRODUCTS_LIST_CACHE_VERSION,
    PRODUCTS_LIST_CACHE_VERSION_KEY,
=======
from api.models import CategoryGroup, Order, OrderItem, Product, ProductCategory, ProductImage
from api.cache_utils import (
    CATEGORIES_LIST_CACHE_KEY,
    CATEGORY_GROUPS_LIST_CACHE_KEY,
    bump_products_cache_generation,
>>>>>>> dev
)
from api.services.post_delivery_categories import invalidate_post_delivery_category_cache
from api.services.product_sales import (
    collect_product_ids_for_order,
    schedule_product_sales_rebuild,
)

logger = logging.getLogger(__name__)

# Re-export for tests and other modules
__all__ = [
    "CATEGORIES_LIST_CACHE_KEY",
    "CATEGORY_GROUPS_LIST_CACHE_KEY",
    "invalidate_category_list_caches",
    "invalidate_product_list_caches",
]


def invalidate_product_list_caches() -> None:
    """Bump product list generation so all query-param keys refresh."""
    bump_products_cache_generation()


def invalidate_category_list_caches() -> None:
    """Drop storefront category/group list caches after admin edits."""
    cache.delete(CATEGORIES_LIST_CACHE_KEY)
    cache.delete(CATEGORY_GROUPS_LIST_CACHE_KEY)
    # Legacy keys from earlier API versions
    cache.delete("categories_list_v5")
    cache.delete("categories_list_v6")
    cache.delete("category_groups_list_v1")
    cache.delete("category_groups_list_v2")


def bump_products_list_cache_version() -> None:
    """Invalidate product list API cache by bumping the version prefix."""
    try:
        cache.incr(PRODUCTS_LIST_CACHE_VERSION_KEY)
    except ValueError:
        cache.set(
            PRODUCTS_LIST_CACHE_VERSION_KEY,
            DEFAULT_PRODUCTS_LIST_CACHE_VERSION + 1,
        )


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


@receiver(post_save, sender=Product, dispatch_uid="api.product_list_cache_clear")
@receiver(post_delete, sender=Product, dispatch_uid="api.product_list_delete_cache_clear")
def product_invalidate_list_cache(sender, instance, **kwargs):
    bump_products_list_cache_version()


@receiver(post_save, sender=ProductCategory, dispatch_uid="api.product_category_cache_clear")
@receiver(post_delete, sender=ProductCategory, dispatch_uid="api.product_category_delete_cache_clear")
def product_category_invalidate_list_cache(sender, instance, **kwargs):
    invalidate_category_list_caches()
    bump_products_list_cache_version()


@receiver(post_save, sender=CategoryGroup, dispatch_uid="api.category_group_cache_clear")
@receiver(post_delete, sender=CategoryGroup, dispatch_uid="api.category_group_delete_cache_clear")
def category_group_invalidate_post_delivery_cache(sender, instance, **kwargs):
    invalidate_post_delivery_category_cache(instance.pk)
    invalidate_category_list_caches()
    bump_products_list_cache_version()


@receiver(
    m2m_changed,
    sender=CategoryGroup.categories.through,
    dispatch_uid="api.category_group_m2m_cache_clear",
)
def category_group_categories_changed(sender, instance, action, **kwargs):
    if action in ("post_add", "post_remove", "post_clear") and isinstance(
        instance, CategoryGroup
    ):
        invalidate_post_delivery_category_cache(instance.pk)
        invalidate_category_list_caches()
<<<<<<< HEAD
        bump_products_list_cache_version()
=======


@receiver(post_save, sender=Product, dispatch_uid="api.product_cache_invalidate")
@receiver(post_delete, sender=Product, dispatch_uid="api.product_delete_cache_invalidate")
@receiver(post_save, sender=ProductImage, dispatch_uid="api.product_image_cache_invalidate")
@receiver(post_delete, sender=ProductImage, dispatch_uid="api.product_image_delete_cache_invalidate")
def product_invalidate_list_caches(sender, instance, **kwargs):
    invalidate_product_list_caches()
    invalidate_category_list_caches()
>>>>>>> dev
