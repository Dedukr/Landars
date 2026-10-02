"""
Low-level Stripe adapter for invoice Checkout Sessions.

Keeps Stripe SDK calls out of models, templates, and HTTP views.
Mirrors the project's existing stripe module usage (api_key + stripe.*).
"""

from __future__ import annotations

import logging
from typing import Any

import stripe
from django.conf import settings

logger = logging.getLogger(__name__)

# Confirmed in stripe==13.0.1 (PaymentMethod.PayByBank + Checkout Session create params).
PAY_BY_BANK_PAYMENT_METHOD = "pay_by_bank"


class StripePayByBankUnavailable(Exception):
    """Raised when Stripe rejects Pay by Bank (not enabled / unsupported)."""


class StripePaymentService:
    """Thin wrapper around Stripe Checkout Session create / retrieve / expire."""

    def __init__(self) -> None:
        stripe.api_key = settings.STRIPE_SECRET_KEY

    def create_pay_by_bank_checkout_session(
        self,
        *,
        amount_pence: int,
        currency: str,
        description: str,
        success_url: str,
        cancel_url: str,
        metadata: dict[str, str],
        idempotency_key: str,
        customer_email: str | None = None,
    ) -> Any:
        """
        Create a one-time Checkout Session with Pay by Bank ONLY.

        Does not enable cards. If the Stripe account cannot accept Pay by Bank,
        raises StripePayByBankUnavailable (no silent card fallback).
        """
        if amount_pence <= 0:
            raise ValueError("Checkout amount must be positive")

        params: dict[str, Any] = {
            "mode": "payment",
            "payment_method_types": [PAY_BY_BANK_PAYMENT_METHOD],
            "line_items": [
                {
                    "price_data": {
                        "currency": currency.lower(),
                        "unit_amount": amount_pence,
                        "product_data": {
                            "name": description,
                        },
                    },
                    "quantity": 1,
                }
            ],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": metadata,
            "payment_intent_data": {
                "metadata": metadata,
                "description": description,
            },
        }
        if customer_email:
            params["customer_email"] = customer_email

        try:
            session = stripe.checkout.Session.create(
                **params,
                idempotency_key=idempotency_key,
            )
        except stripe.InvalidRequestError as exc:
            message = str(exc)
            lowered = message.lower()
            if (
                PAY_BY_BANK_PAYMENT_METHOD in lowered
                or "payment method type" in lowered
                or "payment_method_types" in lowered
            ):
                logger.error(
                    "Pay by Bank unavailable for invoice checkout: %s", message
                )
                raise StripePayByBankUnavailable(
                    "Pay by Bank is not available for this Stripe account. "
                    "Card payments are intentionally not enabled for invoices. "
                    f"Stripe said: {message}"
                ) from exc
            raise
        except stripe.StripeError:
            logger.exception("Stripe error creating invoice Checkout Session")
            raise

        return session

    def retrieve_checkout_session(self, session_id: str) -> Any | None:
        if not session_id:
            return None
        try:
            return stripe.checkout.Session.retrieve(session_id)
        except stripe.InvalidRequestError:
            logger.warning("Checkout Session %s not found", session_id)
            return None
        except stripe.StripeError:
            logger.exception("Failed to retrieve Checkout Session %s", session_id)
            return None

    def expire_checkout_session(self, session_id: str) -> bool:
        """
        Expire an open Checkout Session. Returns True if expired (or already not open).
        Does not attempt to expire completed sessions.
        """
        if not session_id:
            return False
        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except stripe.StripeError:
            logger.warning(
                "Could not retrieve Checkout Session %s to expire", session_id
            )
            return False

        status = getattr(session, "status", None)
        if status != "open":
            logger.info(
                "Skip expire Checkout Session %s (status=%s)", session_id, status
            )
            return False

        try:
            stripe.checkout.Session.expire(session_id)
            logger.info("Expired Checkout Session %s", session_id)
            return True
        except stripe.InvalidRequestError as exc:
            # Race: session completed between retrieve and expire.
            logger.info(
                "Could not expire Checkout Session %s: %s", session_id, exc
            )
            return False
        except stripe.StripeError:
            logger.exception("Failed to expire Checkout Session %s", session_id)
            return False
