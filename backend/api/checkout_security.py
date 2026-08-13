"""
Server-side checkout pricing and payment verification.

Never trust client-supplied amounts for discount, delivery fee, shipping cost,
or payment_status. Compute or verify those values on the server.
"""

from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Canonical storefront coupons (code -> fraction of cart sum_price).
COUPON_RATES: dict[str, Decimal] = {
    "save10": Decimal("0.10"),
}

TWOPLACES = Decimal("0.01")


def normalize_coupon_code(code: str | None) -> str:
    return (code or "").strip().lower()


def discount_for_coupon(sum_price: Decimal, coupon_code: str | None) -> Decimal:
    """Return monetary discount for a known coupon, else 0."""
    rate = COUPON_RATES.get(normalize_coupon_code(coupon_code))
    if rate is None:
        return Decimal("0.00")
    base = Decimal(str(sum_price or 0))
    if base <= 0:
        return Decimal("0.00")
    return (base * rate).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def apply_coupon_to_cart(cart, coupon_code: str | None) -> tuple[Decimal, str | None]:
    """
    Set cart.discount from a coupon code (or clear when empty/invalid).

    Returns (discount_amount, error_message_or_none).
    """
    code = normalize_coupon_code(coupon_code)
    if not code:
        cart.discount = Decimal("0.00")
        return cart.discount, None

    if code not in COUPON_RATES:
        return cart.discount, "Invalid coupon code"

    cart.discount = discount_for_coupon(cart.sum_price, code)
    return cart.discount, None


def money_to_pence(amount: Decimal | str | int | float) -> int:
    value = Decimal(str(amount or 0)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    return int((value * 100).to_integral_value(rounding=ROUND_HALF_UP))


def resolve_post_delivery_fee(
    *,
    shipping_method_id: int,
    address: dict[str, Any],
    cart_items: list,
) -> Decimal:
    """
    Re-quote Sendcloud options and return the price for the chosen method id.
    Raises ValueError if the method is not among current quotes.
    """
    from shipping.sendcloud_shipping import ShippingService

    items = [
        {"product": item.product_id, "quantity": str(item.quantity)}
        for item in cart_items
        if getattr(item, "product_id", None)
    ]
    service = ShippingService()
    options = service.get_shipping_options(address=address, items=items)
    method_id = int(shipping_method_id)
    for option in options:
        try:
            if int(option.get("id")) == method_id:
                return Decimal(str(option["price"])).quantize(
                    TWOPLACES, rounding=ROUND_HALF_UP
                )
        except (TypeError, ValueError, KeyError):
            continue
    raise ValueError("Selected shipping method is not available for this cart/address")


def verify_stripe_payment_for_checkout(
    *,
    payment_intent_id: str,
    user,
    expected_total: Decimal,
) -> tuple[bool, str | None]:
    """
    Confirm a PaymentIntent belongs to this user, succeeded, and matches total.

    Returns (ok, error_message).
    """
    if not payment_intent_id or not str(payment_intent_id).startswith("pi_"):
        return False, "Invalid payment intent"

    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        intent = stripe.PaymentIntent.retrieve(str(payment_intent_id))
    except stripe.error.StripeError as exc:
        logger.warning("Stripe retrieve failed for %s: %s", payment_intent_id, exc)
        return False, "Unable to verify payment"

    metadata = getattr(intent, "metadata", None) or {}
    meta_user = str(metadata.get("user_id") or "")
    if meta_user and meta_user != str(user.id):
        return False, "Payment does not belong to this user"

    if intent.status != "succeeded":
        return False, f"Payment not completed (status={intent.status})"

    expected_pence = money_to_pence(expected_total)
    if int(intent.amount) != expected_pence:
        logger.warning(
            "Payment amount mismatch pi=%s expected=%s actual=%s user=%s",
            payment_intent_id,
            expected_pence,
            intent.amount,
            user.id,
        )
        return False, "Payment amount does not match order total"

    currency = (intent.currency or "").lower()
    if currency and currency != "gbp":
        return False, "Unsupported payment currency"

    return True, None


def payment_status_rejection_response() -> Response:
    """Client must not set payment_status; paid state comes from Stripe only."""
    return Response(
        {
            "error": (
                "payment_status cannot be set by the client. "
                "Provide payment_intent_id after a successful Stripe charge, "
                "or omit it to create a pending order."
            )
        },
        status=status.HTTP_400_BAD_REQUEST,
    )
