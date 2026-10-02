"""
Invoice payment orchestration.

Invoice → InvoicePaymentService → StripePaymentService
Webhook / reconciliation also lands here to mark invoices paid idempotently.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from api.checkout_security import money_to_pence
from billing.models import Invoice
from billing.services.stripe_payment import (
    PAY_BY_BANK_PAYMENT_METHOD,
    StripePayByBankUnavailable,
    StripePaymentService,
)

logger = logging.getLogger(__name__)

INVOICE_CURRENCY = "gbp"


class InvoicePaymentError(Exception):
    """Domain error for invoice payment flows (safe to surface generically)."""


class InvoicePaymentService:
    """Create/reuse Checkout Sessions and reconcile Stripe payments onto invoices."""

    def __init__(self, stripe_service: StripePaymentService | None = None) -> None:
        self.stripe = stripe_service or StripePaymentService()

    @staticmethod
    def _idempotency_key(invoice: Invoice) -> str:
        return f"invoice-payment-{invoice.pk}-{invoice.payment_version}"

    @staticmethod
    def _stripe_description(invoice: Invoice) -> str:
        return f"LandarsFood Invoice {invoice.display_invoice_number}"

    @staticmethod
    def _metadata(invoice: Invoice) -> dict[str, str]:
        meta = {
            "invoice_id": str(invoice.pk),
            "invoice_number": str(invoice.invoice_number),
            "payment_version": str(invoice.payment_version),
            "purpose": "invoice_pay_by_bank",
        }
        if invoice.order_id:
            customer_id = getattr(invoice.order, "customer_id", None)
            if customer_id:
                meta["customer_id"] = str(customer_id)
        return meta

    def expire_open_checkout_session(self, invoice: Invoice) -> None:
        """Expire stored open Checkout Session if present (safe if already complete)."""
        session_id = (invoice.stripe_checkout_session_id or "").strip()
        if not session_id:
            return
        expired = self.stripe.expire_checkout_session(session_id)
        if expired:
            # Cleared only when we actively expired an open session (e.g. bank transfer).
            Invoice.objects.filter(pk=invoice.pk).update(
                stripe_checkout_session_id="",
                stripe_payment_status="expired",
            )
            invoice.stripe_checkout_session_id = ""
            invoice.stripe_payment_status = "expired"

    # Alias used from model hooks
    expire_open_checkout_if_any = expire_open_checkout_session

    def get_or_create_checkout_redirect_url(self, invoice: Invoice) -> str:
        """
        Return a Stripe Checkout URL for an unpaid invoice.

        Reuses an existing open session for the current payment_version when possible.
        Concurrent callers are serialised with select_for_update + Stripe idempotency keys.
        """
        if invoice.status == Invoice.Status.PAID:
            raise InvoicePaymentError("Invoice is already paid")
        if invoice.status == Invoice.Status.VOID:
            raise InvoicePaymentError("Invoice is no longer payable")

        outstanding = invoice.amount_due
        if outstanding <= 0:
            raise InvoicePaymentError("Invoice has no outstanding balance")

        with transaction.atomic():
            locked = (
                Invoice.objects.select_for_update()
                .select_related("order")
                .get(pk=invoice.pk)
            )
            if locked.status in (Invoice.Status.PAID, Invoice.Status.VOID):
                raise InvoicePaymentError("Invoice is no longer payable")
            if locked.amount_due <= 0:
                raise InvoicePaymentError("Invoice has no outstanding balance")

            existing_id = (locked.stripe_checkout_session_id or "").strip()
            if existing_id:
                session = self.stripe.retrieve_checkout_session(existing_id)
                if session is not None:
                    status = getattr(session, "status", None)
                    payment_status = getattr(session, "payment_status", None)
                    amount_total = getattr(session, "amount_total", None)
                    currency = (getattr(session, "currency", None) or "").lower()
                    expected_pence = money_to_pence(locked.amount_due)
                    if (
                        status == "open"
                        and payment_status == "unpaid"
                        and int(amount_total or 0) == expected_pence
                        and currency == INVOICE_CURRENCY
                    ):
                        url = getattr(session, "url", None)
                        if url:
                            return url
                    # Stale / wrong amount / completed — expire if still open.
                    if status == "open":
                        self.stripe.expire_checkout_session(existing_id)
                locked.stripe_checkout_session_id = ""
                locked.stripe_payment_status = ""
                locked.save(
                    update_fields=[
                        "stripe_checkout_session_id",
                        "stripe_payment_status",
                    ]
                )

            amount_pence = money_to_pence(locked.amount_due)
            success_url = (
                f"{locked.public_payment_url}?payment=complete"
                if locked.public_payment_url
                else None
            )
            cancel_url = locked.public_payment_url or success_url
            if not success_url or not cancel_url:
                raise InvoicePaymentError("Invoice payment URL is not configured")

            customer_email = None
            snap = locked.customer_snapshot or {}
            if isinstance(snap, dict):
                customer_email = (snap.get("email") or "").strip() or None

            try:
                session = self.stripe.create_pay_by_bank_checkout_session(
                    amount_pence=amount_pence,
                    currency=INVOICE_CURRENCY,
                    description=self._stripe_description(locked),
                    success_url=success_url,
                    cancel_url=cancel_url,
                    metadata=self._metadata(locked),
                    idempotency_key=self._idempotency_key(locked),
                    customer_email=customer_email,
                )
            except StripePayByBankUnavailable:
                raise
            except Exception as exc:
                logger.exception(
                    "Failed creating Checkout Session for invoice %s", locked.pk
                )
                raise InvoicePaymentError(
                    "Unable to start online payment. Please try again or pay by bank transfer."
                ) from exc

            locked.stripe_checkout_session_id = session.id
            locked.stripe_payment_status = getattr(session, "payment_status", "") or "unpaid"
            pi = getattr(session, "payment_intent", None)
            if isinstance(pi, str) and pi:
                locked.stripe_payment_intent_id = pi
            locked.save(
                update_fields=[
                    "stripe_checkout_session_id",
                    "stripe_payment_status",
                    "stripe_payment_intent_id",
                ]
            )
            url = getattr(session, "url", None)
            if not url:
                raise InvoicePaymentError("Stripe Checkout Session missing redirect URL")
            return url

    def confirm_paid_from_stripe(self, invoice: Invoice) -> Invoice:
        """
        Mark the invoice paid when Stripe already reports its Checkout Session as paid.

        The success URL query string is not proof of payment. Returning customers
        and the confirmation poll ask Stripe directly, so the page can finish
        when the webhook has not arrived yet.
        """
        if invoice.status in (Invoice.Status.PAID, Invoice.Status.VOID):
            return invoice
        if invoice.amount_due <= 0:
            return invoice

        session_id = (invoice.stripe_checkout_session_id or "").strip()
        if not session_id:
            return invoice

        session = self.stripe.retrieve_checkout_session(session_id)
        if session is None or getattr(session, "payment_status", None) != "paid":
            return invoice

        try:
            updated = self.reconcile_checkout_session(session, require_paid=True)
        except InvoicePaymentError:
            logger.exception(
                "Could not confirm Stripe payment for invoice %s", invoice.pk
            )
            return invoice
        if updated is None:
            return invoice
        updated.refresh_from_db()
        return updated

    def reconcile_checkout_session(
        self,
        session_obj: dict[str, Any] | Any,
        *,
        require_paid: bool = True,
    ) -> Invoice | None:
        """
        Idempotently mark an invoice paid from a Checkout Session payload.

        Validates currency, amount, and payment success. Duplicate delivery is a no-op.
        """
        if hasattr(session_obj, "to_dict"):
            session = session_obj.to_dict()
        elif isinstance(session_obj, dict):
            session = session_obj
        else:
            session = dict(session_obj)

        metadata = session.get("metadata") or {}
        invoice_id = metadata.get("invoice_id")
        if not invoice_id:
            # Not an invoice checkout.
            return None

        payment_status = session.get("payment_status")
        session_status = session.get("status")
        if require_paid and payment_status != "paid":
            logger.info(
                "Ignoring unpaid checkout session %s (payment_status=%s status=%s)",
                session.get("id"),
                payment_status,
                session_status,
            )
            return None

        with transaction.atomic():
            try:
                invoice = Invoice.objects.select_for_update().get(pk=int(invoice_id))
            except (Invoice.DoesNotExist, TypeError, ValueError):
                logger.warning(
                    "Checkout Session %s references unknown invoice_id=%s",
                    session.get("id"),
                    invoice_id,
                )
                return None

            if invoice.status == Invoice.Status.VOID:
                logger.error(
                    "Rejecting payment for VOID invoice %s session=%s",
                    invoice.pk,
                    session.get("id"),
                )
                return None

            if invoice.status == Invoice.Status.PAID:
                # Idempotent success — still refresh Stripe refs if missing.
                self._store_stripe_refs(invoice, session)
                return invoice

            currency = (session.get("currency") or "").lower()
            if currency != INVOICE_CURRENCY:
                logger.error(
                    "Currency mismatch for invoice %s: expected %s got %s",
                    invoice.pk,
                    INVOICE_CURRENCY,
                    currency,
                )
                raise InvoicePaymentError("Currency mismatch")

            amount_total = int(session.get("amount_total") or 0)
            expected = money_to_pence(invoice.amount_due)
            # If partially paid already via another channel, amount_due is remaining.
            # Stripe session was created for a specific amount — also accept match vs total unpaid at creation.
            if amount_total != expected and amount_total != money_to_pence(
                invoice.total_amount - (invoice.amount_paid or Decimal("0"))
            ):
                # Final check: full invoice total (session created when unpaid in full).
                if amount_total != money_to_pence(invoice.total_amount):
                    logger.error(
                        "Amount mismatch for invoice %s: expected_due=%s session=%s",
                        invoice.pk,
                        expected,
                        amount_total,
                    )
                    raise InvoicePaymentError("Amount mismatch")

            # Apply the Stripe amount as payment (in major units).
            paid_major = (Decimal(amount_total) / Decimal("100")).quantize(
                Decimal("0.01")
            )
            invoice.apply_payment(paid_major, paid_at=timezone.now())
            self._store_stripe_refs(invoice, session, payment_status="paid")
            logger.info(
                "Invoice %s marked PAID via Stripe Checkout %s",
                invoice.pk,
                session.get("id"),
            )
            return invoice

    def _store_stripe_refs(
        self,
        invoice: Invoice,
        session: dict[str, Any],
        *,
        payment_status: str | None = None,
    ) -> None:
        session_id = session.get("id") or ""
        pi = session.get("payment_intent") or ""
        if isinstance(pi, dict):
            pi = pi.get("id") or ""
        update_fields = []
        if session_id and invoice.stripe_checkout_session_id != session_id:
            invoice.stripe_checkout_session_id = session_id
            update_fields.append("stripe_checkout_session_id")
        if pi and invoice.stripe_payment_intent_id != pi:
            invoice.stripe_payment_intent_id = str(pi)
            update_fields.append("stripe_payment_intent_id")
        status_value = payment_status or session.get("payment_status") or ""
        if status_value and invoice.stripe_payment_status != status_value:
            invoice.stripe_payment_status = status_value
            update_fields.append("stripe_payment_status")
        if update_fields:
            invoice.save(update_fields=update_fields)


# Module-level helpers for views/webhooks without constructing repeatedly.
_default_service: InvoicePaymentService | None = None


def get_invoice_payment_service() -> InvoicePaymentService:
    global _default_service
    if _default_service is None:
        _default_service = InvoicePaymentService()
    return _default_service


__all__ = [
    "INVOICE_CURRENCY",
    "InvoicePaymentError",
    "InvoicePaymentService",
    "PAY_BY_BANK_PAYMENT_METHOD",
    "StripePayByBankUnavailable",
    "get_invoice_payment_service",
]
