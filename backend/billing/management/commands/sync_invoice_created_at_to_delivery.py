"""
Set Invoice.created_at from the invoice's snapshot delivery_date (invoice numbers in a range).

`Invoice.due_date` is a @property (created_at + 14 days), so there is no separate DB field
to update — changing created_at is enough for templates and new PDFs.

Usage:
  python manage.py sync_invoice_created_at_to_delivery --dry-run
  python manage.py sync_invoice_created_at_to_delivery
  python manage.py sync_invoice_created_at_to_delivery --from-number 1 --to-number 1072 --time 12:00:00
"""

from __future__ import annotations

import datetime as dt

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "For invoices in an invoice_number range, set created_at to a datetime on "
        "delivery_date (local TIME_ZONE). Due date in the app is derived from created_at."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--from-number",
            type=int,
            default=1,
            help="First invoice_number (inclusive). Default: 1.",
        )
        parser.add_argument(
            "--to-number",
            type=int,
            default=1072,
            help="Last invoice_number (inclusive). Default: 1072.",
        )
        parser.add_argument(
            "--time",
            type=str,
            default="00:00:00",
            help="Time-of-day on delivery_date (HH:MM:SS). Default: 00:00:00.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would change; do not write.",
        )

    def handle(self, *args, **options):
        from billing.models import Invoice

        n_from: int = options["from_number"]
        n_to: int = options["to_number"]
        dry_run: bool = options["dry_run"]
        time_str: str = options["time"]

        try:
            parts = [int(x) for x in time_str.split(":")]
            if len(parts) == 2:
                h, m = parts
                s = 0
            elif len(parts) == 3:
                h, m, s = parts
            else:
                raise ValueError
            t = dt.time(h, m, s)
        except ValueError as exc:
            self.stderr.write(self.style.ERROR(f"Invalid --time '{time_str}', use HH:MM:SS"))
            raise SystemExit(1) from exc

        tz = timezone.get_current_timezone()
        qs = (
            Invoice.objects.filter(
                invoice_number__gte=n_from,
                invoice_number__lte=n_to,
            )
            .order_by("invoice_number")
        )

        updated = 0
        skipped_no_delivery = 0
        unchanged = 0

        for inv in qs.iterator(chunk_size=200):
            if inv.delivery_date is None:
                skipped_no_delivery += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"Skip invoice_number={inv.invoice_number} (id={inv.pk}): no delivery_date"
                    )
                )
                continue

            naive = dt.datetime.combine(inv.delivery_date, t)
            if settings.USE_TZ:
                new_created = timezone.make_aware(naive, tz)
            else:
                new_created = naive

            if inv.created_at == new_created:
                unchanged += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"Would update #{inv.invoice_number} (id={inv.pk}): "
                    f"created_at {inv.created_at} -> {new_created}"
                )
                updated += 1
            else:
                Invoice.objects.filter(pk=inv.pk).update(created_at=new_created)
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done ({'dry-run' if dry_run else 'applied'}). "
                f"Updated: {updated}, unchanged: {unchanged}, skipped (no delivery_date): {skipped_no_delivery}. "
                f"Timezone: {tz} (USE_TZ={settings.USE_TZ})."
            )
        )
