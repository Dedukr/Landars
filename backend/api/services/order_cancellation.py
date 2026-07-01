"""
Centralised order cancellation workflow.

Used by admin bulk actions, admin status saves, and billing flows so every path
into ``cancelled`` follows the same steps:

1. Issue a credit note for the latest invoice when one exists and is not yet voided.
2. Persist ``status=cancelled`` via ``set_order_status`` (fires shipping signals).

Shipping / Sendcloud cancellation is **not** handled here directly — the
``post_save`` receiver in ``shipping.signals.on_order_transition_cancelled`` runs
when ``set_order_status`` saves the order and deletes the related ``Shipment``
(Sendcloud parcel cancel + label cleanup happen in ``Shipment`` ``pre_delete``).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from billing.models import CreditNote, Invoice, create_credit_note

from api.services.product_sales import set_order_status

logger = logging.getLogger(__name__)

DEFAULT_CANCEL_REASON = "Order cancelled"


@dataclass(frozen=True)
class OrderCancelResult:
    """Outcome of a single ``cancel_order`` call."""

    cancelled: bool
    skipped_already_cancelled: bool
    credit_note_created: bool
    credit_note_number: int | None = None


def issue_credit_note_if_needed(
    order,
    *,
    request,
    reason: str = DEFAULT_CANCEL_REASON,
) -> tuple[bool, int | None]:
    """
    Create a credit note for the order's latest invoice when appropriate.

    Skips when there is no invoice, the invoice is already void, or a credit note
    already exists. Returns ``(created, credit_note_number)``.
    """
    try:
        invoice = order.invoices.latest("created_at")
    except Invoice.DoesNotExist:
        return False, None

    if invoice.status == Invoice.Status.VOID:
        return False, None

    try:
        invoice.credit_note
        return False, None
    except CreditNote.DoesNotExist:
        pass

    credit_note = create_credit_note(invoice=invoice, reason=reason, request=request)
    logger.info(
        "Order %s: issued credit note #%s for invoice #%s",
        order.pk,
        credit_note.credit_note_number,
        invoice.invoice_number,
    )
    return True, credit_note.credit_note_number


def cancel_order(
    order,
    *,
    request,
    reason: str = DEFAULT_CANCEL_REASON,
    issue_credit_note: bool = True,
) -> OrderCancelResult:
    """
    Full cancellation workflow for one order.

    Parameters
    ----------
    issue_credit_note:
        When ``False``, only the status transition runs (credit note already created).
    """
    if order.status == "cancelled":
        return OrderCancelResult(
            cancelled=False,
            skipped_already_cancelled=True,
            credit_note_created=False,
        )

    credit_note_created = False
    credit_note_number = None
    if issue_credit_note:
        credit_note_created, credit_note_number = issue_credit_note_if_needed(
            order, request=request, reason=reason
        )

    set_order_status(order, "cancelled")
    logger.info("Order %s marked as cancelled", order.pk)

    return OrderCancelResult(
        cancelled=True,
        skipped_already_cancelled=False,
        credit_note_created=credit_note_created,
        credit_note_number=credit_note_number,
    )
