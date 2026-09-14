"""
Order address freeze / release policy.

Unfrozen orders (e.g. pending, issued) follow the customer's live profile address.
Frozen statuses (paid, ready_to_ship, cancelled) copy profile fields onto
order-owned Address / BillingAddress rows.

Invoices never freeze the order — they only snapshot into Invoice JSON fields
at creation time.
"""

from __future__ import annotations

import logging

from account.billing_address import create_order_billing_address
from account.models import Address

logger = logging.getLogger(__name__)

# Statuses that keep a frozen copy of the customer address on the order.
ORDER_ADDRESS_FREEZE_STATUSES = frozenset({"paid", "ready_to_ship", "cancelled"})


def _delivery_fields_from_address(address: Address | None) -> dict[str, str | None]:
    if address is None:
        return {
            "address_line": None,
            "address_line2": None,
            "city": None,
            "postal_code": None,
        }
    return {
        "address_line": address.address_line,
        "address_line2": address.address_line2,
        "city": address.city,
        "postal_code": address.postal_code,
    }


def _apply_fields(instance, fields: dict[str, str | None]) -> None:
    for key, value in fields.items():
        setattr(instance, key, value)


def _profile_address_id(profile) -> int | None:
    return getattr(profile, "address_id", None)


def _profile_billing_id(profile) -> int | None:
    return getattr(profile, "billing_address_id", None)


def order_has_frozen_delivery(order) -> bool:
    """True when ``order.address`` is an order-owned row (not the live profile address)."""
    customer = getattr(order, "customer", None)
    if not order.address_id or customer is None:
        return False
    profile = getattr(customer, "profile", None)
    if profile is None:
        return True
    return order.address_id != _profile_address_id(profile)


def freeze_order_addresses_from_customer(order) -> bool:
    """
    Copy the customer's current profile addresses onto order-owned rows.

    Returns True when the order was updated.
    """
    customer = getattr(order, "customer", None)
    if customer is None:
        logger.warning(
            "Cannot freeze addresses for order %s: no customer",
            getattr(order, "pk", None),
        )
        return False

    profile = getattr(customer, "profile", None)
    if profile is None:
        logger.warning(
            "Cannot freeze addresses for order %s: customer %s has no profile",
            getattr(order, "pk", None),
            customer.pk,
        )
        return False

    profile_address = profile.address
    delivery_fields = _delivery_fields_from_address(profile_address)
    profile_address_id = _profile_address_id(profile)

    update_fields: list[str] = []
    changed = False

    order_address = order.address
    owns_delivery = (
        order_address is not None and order.address_id != profile_address_id
    )
    if owns_delivery:
        _apply_fields(order_address, delivery_fields)
        order_address.save(
            update_fields=[
                "address_line",
                "address_line2",
                "city",
                "postal_code",
            ]
        )
        changed = True
    else:
        order.address = Address.objects.create(**delivery_fields)
        update_fields.append("address")
        changed = True

    if order.bill_use_delivery_address:
        if order.billing_address_id is not None:
            order.billing_address = None
            update_fields.append("billing_address")
            changed = True
    else:
        source_billing = profile.billing_address
        if source_billing is None:
            logger.warning(
                "Order %s uses separate billing but customer %s has no billing address",
                getattr(order, "pk", None),
                customer.pk,
            )
        else:
            billing_fields = source_billing.as_dict()
            profile_billing_id = _profile_billing_id(profile)
            order_billing = order.billing_address
            owns_billing = (
                order_billing is not None
                and order.billing_address_id != profile_billing_id
            )
            if owns_billing:
                _apply_fields(order_billing, billing_fields)
                order_billing.save(
                    update_fields=[
                        "company_name",
                        "contact_name",
                        "address_line",
                        "address_line2",
                        "city",
                        "postal_code",
                    ]
                )
                changed = True
            else:
                order.billing_address = create_order_billing_address(
                    customer, billing_fields
                )
                update_fields.append("billing_address")
                changed = True

    if update_fields:
        order.save(update_fields=update_fields)
        logger.info(
            "Froze address snapshot on order %s from customer %s (fields=%s)",
            order.pk,
            customer.pk,
            update_fields,
        )
        return True

    if changed:
        logger.info(
            "Refreshed order-owned address on order %s from customer %s",
            order.pk,
            customer.pk,
        )
        return True

    return False


def release_order_address_freeze(order) -> bool:
    """
    Drop order-owned address FKs so the order follows the live customer profile.

    Returns True when the order was updated.
    """
    update_fields: list[str] = []

    if order.address_id is not None:
        order.address = None
        update_fields.append("address")

    if order.billing_address_id is not None:
        order.billing_address = None
        update_fields.append("billing_address")

    if not update_fields:
        return False

    order.save(update_fields=update_fields)
    logger.info(
        "Released address freeze on order %s (cleared %s); now follows customer profile",
        order.pk,
        update_fields,
    )
    return True


def sync_order_address_freeze_for_status(order, status: str | None = None) -> None:
    """
    Freeze or release order addresses according to ``status``.

    ``paid`` / ``ready_to_ship`` / ``cancelled`` → freeze from customer.
    Any other status → release freeze (live profile address).
    """
    resolved = status if status is not None else getattr(order, "status", None)
    if resolved in ORDER_ADDRESS_FREEZE_STATUSES:
        freeze_order_addresses_from_customer(order)
    else:
        release_order_address_freeze(order)
