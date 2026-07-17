from __future__ import annotations

import logging

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils import timezone

from festival.models import (
    FestivalCreditNote,
    FestivalInvoice,
    FestivalOrder,
    FestivalPrintJob,
)
from festival.services.cloudprnt import create_print_batch, get_active_printer
from festival.services.documents import create_credit_note_from_invoice
from festival.services.tickets import (
    render_cancellation_kitchen_ticket,
    render_customer_credit_ticket,
)

logger = logging.getLogger(__name__)


class FestivalCancellationError(Exception):
    pass


@transaction.atomic
def cancel_festival_order(
    *,
    order: FestivalOrder,
    user,
    reason: str = "",
    request=None,
) -> FestivalOrder:
    if not user or not user.is_authenticated:
        raise FestivalCancellationError("Authentication required.")
    if not user.is_superuser and not user.has_perm("festival.cancel_festival_order"):
        raise FestivalCancellationError("Owner cancellation permission required.")

    order = FestivalOrder.objects.select_for_update().get(pk=order.pk)
    if order.status == FestivalOrder.Status.CANCELLED:
        raise FestivalCancellationError("Order is already cancelled.")

    try:
        invoice = FestivalInvoice.objects.select_for_update().get(order=order)
    except FestivalInvoice.DoesNotExist as exc:
        raise FestivalCancellationError("Order has no invoice.") from exc

    if invoice.status == FestivalInvoice.Status.CREDITED:
        raise FestivalCancellationError("Invoice is already credited.")
    if FestivalCreditNote.objects.filter(invoice=invoice).exists():
        raise FestivalCancellationError("A credit note already exists for this invoice.")

    reason = (reason or "").strip()
    now = timezone.now()
    order.status = FestivalOrder.Status.CANCELLED
    order.cancelled_at = now
    order.cancellation_reason = reason
    order.save(
        update_fields=["status", "cancelled_at", "cancellation_reason"]
    )

    credit_note = create_credit_note_from_invoice(invoice=invoice, reason=reason)
    invoice.status = FestivalInvoice.Status.CREDITED
    invoice.credited_at = now
    invoice.save(update_fields=["status", "credited_at"])

    # Cancel any unfinished print jobs for the original order batch.
    FestivalPrintJob.objects.filter(
        order=order,
        status__in=[
            FestivalPrintJob.Status.READY,
            FestivalPrintJob.Status.CLAIMED,
        ],
    ).update(
        status=FestivalPrintJob.Status.CANCELLED,
        last_error="Cancelled with order.",
        updated_at=now,
    )

    printer = get_active_printer()
    if printer:
        kitchen = render_cancellation_kitchen_ticket(order, reason=reason)
        customer = render_customer_credit_ticket(order, credit_note)
        create_print_batch(
            order=order,
            printer=printer,
            jobs=[
                (FestivalPrintJob.JobType.KITCHEN_CANCELLATION, 1, kitchen),
                (FestivalPrintJob.JobType.CUSTOMER_CREDIT, 2, customer),
            ],
        )

    credit_note_id = credit_note.pk

    def enqueue_pdf():
        from festival.tasks import generate_festival_credit_note_pdf_task

        try:
            generate_festival_credit_note_pdf_task.delay(credit_note_id)
        except Exception:
            logger.exception(
                "Failed to enqueue festival credit-note PDF for %s",
                credit_note_id,
            )

    transaction.on_commit(enqueue_pdf)

    LogEntry.objects.create(
        user_id=user.pk,
        content_type_id=ContentType.objects.get_for_model(order).pk,
        object_id=str(order.pk),
        object_repr=str(order)[:200],
        action_flag=CHANGE,
        change_message=(
            f"Cancelled festival order; credit note {credit_note.credit_note_number}."
        ),
    )

    logger.info(
        "Cancelled festival order id=%s credit_note=%s by=%s",
        order.pk,
        credit_note.credit_note_number,
        user.pk,
    )
    return order
