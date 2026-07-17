"""
Validation for transitioning orders to ``ready_to_ship``.

Post-delivery (Royal Mail / Sendcloud) orders must only contain products that
belong to the post-delivery category group before ops can mark them ready to ship.
"""
from __future__ import annotations

from dataclasses import dataclass

from api.services.post_delivery_categories import product_has_post_delivery_category


@dataclass(frozen=True)
class ReadyToShipValidation:
    """Outcome of :func:`validate_ready_to_ship`."""

    ok: bool
    incompatible_products: tuple[str, ...] = ()
    message: str | None = None


def incompatible_post_delivery_product_names(order) -> list[str]:
    """Product names on ``order`` that are not in the post-delivery category group."""
    names: list[str] = []
    seen: set[str] = set()
    for item in order.items.select_related("product").all():
        if not item.product:
            continue
        if product_has_post_delivery_category(item.product):
            continue
        name = (item.item_name or item.product.name or "Unknown product").strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def validate_ready_to_ship(order) -> ReadyToShipValidation:
    """
    Return whether ``order`` may transition to ``ready_to_ship``.

    Every line product must belong to the post-delivery category group. Mixed
    orders (home delivery) are blocked so ops cannot mark them ready for Royal
    Mail / Sendcloud shipment.
    """
    incompatible = incompatible_post_delivery_product_names(order)
    if not incompatible:
        return ReadyToShipValidation(ok=True)

    product_list = ", ".join(incompatible)
    message = (
        f"Order #{order.pk} cannot be marked ready to ship: it contains products "
        f"that are not compatible for post delivery: {product_list}."
    )
    return ReadyToShipValidation(
        ok=False,
        incompatible_products=tuple(incompatible),
        message=message,
    )


def complete_ready_to_ship_prerequisites(order) -> ReadyToShipValidation:
    """
    Validate the transition and finish courier processing before status persistence.

    Home-delivery orders have no courier work. Post-delivery orders must have their
    Sendcloud parcel label fully stored before this returns successfully.
    """
    validation = validate_ready_to_ship(order)
    if not validation.ok:
        return validation

    from shipping.order_shipping import OrderShippingService

    ok, error = OrderShippingService.complete_ready_to_ship_prerequisites(order)
    if ok:
        return ReadyToShipValidation(ok=True)

    return ReadyToShipValidation(
        ok=False,
        message=(
            f"Order #{order.pk} was not marked ready to ship: "
            f"{error or 'shipment processing failed.'}"
        ),
    )
