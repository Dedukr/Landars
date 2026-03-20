from __future__ import annotations

from datetime import date, datetime

from api.models import Order
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef
from reconciliation.models import BankTransaction, ReconciliationMatch


class Command(BaseCommand):
    help = (
        "1) Delete old, unreconciled orders (no matched transaction and not present in any "
        "suggestions) before a cutoff date, after showing the full list and asking for "
        "confirmation.\n"
        "2) Then mark all remaining orders up to that cutoff date as paid.\n\n"
        "When deleting orders, invoices linked to those orders are deleted first (no credit notes "
        "are created). Orders that have any credit note are excluded from deletion.\n"
        "This command is SAFE by default: it only shows what would be changed. "
        "Use --force to actually perform deletions and status updates."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--before-date",
            type=str,
            default="2026-02-18",
            help=(
                "Cutoff date (YYYY-MM-DD). Orders created before this date and "
                "without any matched/suggested bank transaction may be deleted. "
                "Default: 2026-02-18."
            ),
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Actually delete the candidate orders after confirmation.",
        )

    def handle(self, *args, **options):
        cutoff_str: str = options["before_date"]
        force: bool = options["force"]

        try:
            cutoff_date = datetime.strptime(cutoff_str, "%Y-%m-%d").date()
        except ValueError:
            self.stderr.write(self.style.ERROR(f"Invalid --before-date: {cutoff_str}"))
            return

        self.stdout.write(
            self.style.MIGRATE_HEADING("Step 1: Find old unreconciled orders to delete")
        )
        candidates = self._find_deletion_candidates(cutoff_date)

        if not candidates:
            self.stdout.write(
                self.style.SUCCESS(
                    f"No unreconciled orders found before {cutoff_date.isoformat()} to delete."
                )
            )
            return

        self.stdout.write(
            self.style.WARNING(
                f"Found {len(candidates)} unreconciled orders created before {cutoff_date.isoformat()} "
                f"with no matched transaction and no reconciliation suggestions."
            )
        )
        self.stdout.write(
            self.style.WARNING("These orders are candidates for deletion:")
        )
        self.stdout.write("")

        for order in candidates:
            self.stdout.write(
                f"- Order #{order.id} | customer={order.customer} | "
                f"created_at={order.created_at.isoformat()} | "
                f"status={order.status} | payment_status={order.payment_status} | "
                f"total_price={order.total_price}"
            )

        self.stdout.write("")
        if not force:
            self.stdout.write(
                self.style.WARNING(
                    "Dry-run mode: no orders have been deleted and no statuses were changed.\n"
                    "Re-run with --force to actually delete these orders and mark remaining as paid."
                )
            )
            return

        confirm = input(
            "Type 'delete' to confirm deletion of the orders listed above: "
        ).strip()
        if confirm.lower() != "delete":
            self.stdout.write(self.style.WARNING("Aborted. No orders were deleted."))
            return

        deleted_count = self._delete_orders(candidates)
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted_count} orders created before {cutoff_date.isoformat()}."
            )
        )

        self.stdout.write("")
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "Step 2: Mark remaining pre-cutoff orders as paid"
            )
        )
        paid_count = self._mark_remaining_orders_paid(cutoff_date)
        self.stdout.write(
            self.style.SUCCESS(
                f"Marked {paid_count} remaining orders created before {cutoff_date.isoformat()} as paid."
            )
        )

    def _find_deletion_candidates(self, cutoff: date) -> list[Order]:
        """
        Find orders created before `cutoff` that:
        - are NOT referenced by any matched BankTransaction, and
        - are NOT present in any ReconciliationMatch suggestions, and

        These are considered safe(r) to delete from a reconciliation perspective.
        """
        # Base set: orders older than cutoff (including status="paid")
        qs = Order.objects.filter(created_at__date__lt=cutoff)

        # Never delete orders for specific trusted customers
        qs = qs.exclude(customer__name="Ukrainian St Mary’s Trust Ltd")

        from billing.models import CreditNote

        # Never delete orders that have any credit note linked to any of their invoices.
        # This avoids Django PROTECT on CreditNote.invoice when deleting Invoice rows.
        has_credit_note = Exists(
            CreditNote.objects.filter(invoice__order_id=OuterRef("pk"))
        )
        qs = qs.annotate(_has_cn=has_credit_note).filter(_has_cn=False)

        # Exclude any order that has at least one matched transaction
        qs = qs.exclude(
            bank_transactions__match_status=BankTransaction.MatchStatus.MATCHED
        )

        # Exclude any order that appears in suggestions
        qs = qs.exclude(reconciliation_matches__isnull=False)

        # Materialize as list for safe reuse/logging
        return list(qs.distinct())

    def _delete_orders(self, orders: list[Order]) -> int:
        """
        Delete the given orders inside a transaction.
        """
        if not orders:
            return 0

        ids = [o.id for o in orders]
        with transaction.atomic():
            # Delete invoices linked to these orders first.
            # Credit notes are excluded in _find_deletion_candidates(), so this should not hit PROTECT.
            from billing.models import Invoice

            Invoice.objects.filter(order_id__in=ids).delete()

            deleted_info = Order.objects.filter(id__in=ids).delete()

        # deleted_info is a tuple (count, details_dict); we return the top-level count
        return deleted_info[0]

    def _mark_remaining_orders_paid(self, cutoff: date) -> int:
        """
        After deletion, mark all remaining orders created before `cutoff` as paid.

        This treats everything left in that date range as reconciled (either
        matched directly or intentionally kept).
        """
        qs = Order.objects.filter(created_at__date__lt=cutoff).exclude(status="paid")

        updated = 0
        for order in qs:
            order.status = "paid"
            order.save(update_fields=["status"])
            updated += 1

        return updated
