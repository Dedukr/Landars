"""
Recreate invoices for all eligible orders before a cutoff date, starting invoice
numbering from 1.

Eligible orders:
- delivery_date before --before-date
- delivery_date set (delivery_date_order_id may be null; invoice uses order PK with # in PDF)
- order has NO linked credit note (CreditNote exists for any invoice of the order)

Behavior:
- deletes existing billing.Invoice rows for those eligible orders
- does NOT create any CreditNote
- resets DocumentNumberSequence(INVOICE) to last_number=0 (next issued is 1)
- recreates invoices by calling Invoice.create_and_publish_from_order(order=..., request=...)
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import TYPE_CHECKING

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.test import RequestFactory

if TYPE_CHECKING:
    from django.db.models import QuerySet

logger = logging.getLogger(__name__)


def _orders_eligible_before_date(*, cutoff: date) -> "QuerySet":
    from api.models import Order
    from billing.models import CreditNote

    has_credit_note = Exists(
        CreditNote.objects.filter(invoice__order_id=OuterRef("pk"))
    )

    return (
        Order.objects.filter(
            delivery_date__isnull=False,
            delivery_date__lt=cutoff,
        )
        .annotate(_has_cn=has_credit_note)
        .filter(_has_cn=False)
        .order_by("id")
    )


def _fake_request_for_pdf():
    """Minimal request for WeasyPrint base_url (invoice.html assets)."""
    rf = RequestFactory()
    return rf.get("/", HTTP_HOST="localhost")


class Command(BaseCommand):
    help = (
        "Recreate invoices for orders before --before-date by deleting old invoices "
        "(except orders with credit notes), resetting sequence to 1, and issuing new invoices."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--before-date",
            type=str,
            default="2026-02-18",
            help="Include orders with delivery_date strictly before this date (YYYY-MM-DD). Default: 2026-02-18.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show counts/collision checks and exit without deleting or creating.",
        )

    def handle(self, *args, **options):
        from billing.models import DocumentNumberSequence, Invoice

        before_date_str: str = options["before_date"]
        dry_run: bool = options["dry_run"]

        try:
            cutoff = datetime.strptime(before_date_str, "%Y-%m-%d").date()
        except ValueError as exc:
            raise CommandError(
                f"Invalid --before-date '{before_date_str}'. Use YYYY-MM-DD."
            ) from exc

        base_orders = _orders_eligible_before_date(cutoff=cutoff)
        order_count = base_orders.count()
        order_ids = list(base_orders.values_list("id", flat=True))

        orders_for_create = base_orders.select_related(
            "customer",
            "address",
            "customer__profile",
            "customer__profile__address",
        ).prefetch_related("items", "items__product")

        in_scope_invoices = Invoice.objects.filter(order_id__in=order_ids)
        in_scope_invoice_count = in_scope_invoices.count()
        remaining_invoices = Invoice.objects.exclude(order_id__in=order_ids)
        collision_qs = remaining_invoices.filter(invoice_number__lte=order_count).order_by(
            "invoice_number"
        )
        collision_numbers = list(collision_qs.values_list("invoice_number", flat=True)[:20])

        self.stdout.write(
            self.style.NOTICE(
                f"Eligible orders (delivery_date < {cutoff.isoformat()}, no credit note on any invoice): {order_count}"
            )
        )
        self.stdout.write(
            f"Existing invoices linked to eligible orders (to delete): {in_scope_invoice_count}"
        )
        self.stdout.write(
            f"Remaining invoices outside eligible set: {remaining_invoices.count()}"
        )
        if collision_numbers:
            self.stdout.write(
                self.style.WARNING(
                    "Collision check failed: remaining invoices already use low numbers "
                    f"that would conflict with restart at 1. First conflicts: {collision_numbers}"
                )
            )

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no changes made."))
            return

        if collision_numbers:
            raise CommandError(
                "Cannot restart invoice numbers from 1 because invoices outside the rebuilt set "
                "already use numbers in the range that would be re-issued."
            )

        if not order_ids:
            self.stdout.write(self.style.WARNING("No eligible orders; nothing to do."))
            return

        request = _fake_request_for_pdf()

        with transaction.atomic():
            deleted_total, _ = in_scope_invoices.delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted_total} billing row(s)."))

            DocumentNumberSequence.objects.update_or_create(
                document_type=DocumentNumberSequence.DocumentType.INVOICE,
                defaults={"last_number": 0},
            )
            self.stdout.write(
                self.style.SUCCESS(
                    "Invoice sequence reset to start from 1 (last_number=0)."
                )
            )

        # create_and_publish_from_order uses its own atomic(); run outside the outer atomic
        # so each order commits independently.
        created = 0
        errors = 0
        for order in orders_for_create:
            try:
                Invoice.create_and_publish_from_order(order=order, request=request)
                created += 1
                if created % 50 == 0:
                    self.stdout.write(f"  … {created} invoices created")
            except Exception as exc:
                errors += 1
                logger.exception("Invoice rebuild failed for order %s", order.id)
                self.stderr.write(
                    self.style.ERROR(f"Order {order.id}: {exc}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created {created} invoice(s), {errors} error(s). "
                f"(Order status unchanged; credit notes not created.)"
            )
        )
