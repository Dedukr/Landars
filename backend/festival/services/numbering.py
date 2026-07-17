from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django.db import transaction

from festival.models import FESTIVAL_TICKET_SEQUENCE_MAX, FestivalNumberSequence

TICKET_MIN = 1
TICKET_MAX = FESTIVAL_TICKET_SEQUENCE_MAX


@dataclass(frozen=True)
class TicketAllocation:
    order_number: int


def _get_sequence(document_type: str) -> FestivalNumberSequence:
    seq, _ = FestivalNumberSequence.objects.select_for_update().get_or_create(
        document_type=document_type,
        defaults={"last_number": 0},
    )
    return seq


@transaction.atomic
def allocate_ticket_number() -> TicketAllocation:
    """Allocate the rotating display ticket number 1–99 (wraps after 99)."""
    seq = _get_sequence(FestivalNumberSequence.DocumentType.TICKET)
    if seq.last_number >= TICKET_MAX:
        seq.last_number = TICKET_MIN
    else:
        seq.last_number += 1
    seq.save(update_fields=["last_number"])
    return TicketAllocation(order_number=int(seq.last_number))


def _allocate_monotonic_number(document_type: str) -> int:
    """Allocate the next invoice/credit-note number (never wraps)."""
    seq = _get_sequence(document_type)
    seq.last_number += 1
    seq.save(update_fields=["last_number"])
    return int(seq.last_number)


@transaction.atomic
def allocate_invoice_number() -> str:
    prefix = getattr(settings, "FESTIVAL_INVOICE_PREFIX", "FINV")
    number = _allocate_monotonic_number(
        FestivalNumberSequence.DocumentType.FE_INVOICE
    )
    return f"{prefix}-{number:06d}"


@transaction.atomic
def allocate_credit_note_number() -> str:
    prefix = getattr(settings, "FESTIVAL_CREDIT_NOTE_PREFIX", "FCN")
    number = _allocate_monotonic_number(
        FestivalNumberSequence.DocumentType.FE_CREDIT_NOTE
    )
    return f"{prefix}-{number:06d}"
