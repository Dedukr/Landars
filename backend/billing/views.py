"""
Public invoice payment pages.

GET /pay/invoice/<token>
  - unpaid → redirect to Stripe Checkout (Pay by Bank)
  - paid → Payment received page
  - void → no longer payable
  - invalid token → 404
"""

from __future__ import annotations

import logging

from django.http import Http404, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET

from billing.models import Invoice
from billing.services.invoice_payment import (
    InvoicePaymentError,
    StripePayByBankUnavailable,
    get_invoice_payment_service,
)

logger = logging.getLogger(__name__)


def _invoice_for_token(token: str) -> Invoice:
    token = (token or "").strip()
    if not token or len(token) < 20:
        raise Http404("Not found")
    try:
        return Invoice.objects.select_related("order").get(payment_public_token=token)
    except Invoice.DoesNotExist as exc:
        raise Http404("Not found") from exc


@require_GET
def pay_invoice(request, token: str):
    """
    Stable public payment entrypoint for an invoice.

    Payment success is never inferred from ?payment=complete alone. That
    hint asks Stripe whether the Checkout Session is paid, then the page
    polls until the invoice is marked paid.
    """
    invoice = _invoice_for_token(token)
    payment_complete_hint = request.GET.get("payment") == "complete"
    if payment_complete_hint:
        invoice = get_invoice_payment_service().confirm_paid_from_stripe(invoice)

    if invoice.status == Invoice.Status.VOID:
        return render(
            request,
            "pay/invoice_void.html",
            {"invoice_number": invoice.display_invoice_number},
            status=410,
        )

    if invoice.status == Invoice.Status.PAID or invoice.amount_due <= 0:
        return render(
            request,
            "pay/invoice_paid.html",
            {
                "invoice_number": invoice.display_invoice_number,
                "amount_paid": invoice.amount_paid or invoice.total_amount,
                "paid_at": invoice.paid_at,
                "confirming": False,
            },
        )

    if payment_complete_hint:
        # Webhook may still be in flight — do not trust the query string.
        return render(
            request,
            "pay/invoice_paid.html",
            {
                "invoice_number": invoice.display_invoice_number,
                "amount_paid": invoice.amount_due,  # expected; not yet confirmed
                "paid_at": None,
                "confirming": True,
                "status_url": request.path.rstrip("/") + "/status",
            },
        )

    service = get_invoice_payment_service()
    try:
        checkout_url = service.get_or_create_checkout_redirect_url(invoice)
    except StripePayByBankUnavailable as exc:
        logger.error("Pay by Bank unavailable for invoice %s: %s", invoice.pk, exc)
        return render(
            request,
            "pay/invoice_unavailable.html",
            {
                "invoice_number": invoice.display_invoice_number,
                "message": (
                    "Online bank payment is temporarily unavailable. "
                    "Please pay using the bank transfer details on your invoice."
                ),
            },
            status=503,
        )
    except InvoicePaymentError as exc:
        logger.warning("Invoice payment start failed for %s: %s", invoice.pk, exc)
        return render(
            request,
            "pay/invoice_unavailable.html",
            {
                "invoice_number": invoice.display_invoice_number,
                "message": str(exc),
            },
            status=400,
        )

    return redirect(checkout_url)


@require_GET
def pay_invoice_status(request, token: str):
    """JSON status for the confirming page (polling). Minimal public fields only."""
    invoice = get_invoice_payment_service().confirm_paid_from_stripe(
        _invoice_for_token(token)
    )
    if invoice.status == Invoice.Status.VOID:
        return JsonResponse({"status": "void", "payable": False})
    if invoice.status == Invoice.Status.PAID or invoice.amount_due <= 0:
        return JsonResponse(
            {
                "status": "paid",
                "payable": False,
                "invoice_number": invoice.display_invoice_number,
                "amount_paid": str(invoice.amount_paid or invoice.total_amount),
                "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
            }
        )
    return JsonResponse(
        {
            "status": invoice.status.lower(),
            "payable": True,
            "invoice_number": invoice.display_invoice_number,
            "amount_due": str(invoice.amount_due),
        }
    )
