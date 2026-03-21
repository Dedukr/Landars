"""
Regenerate PDFs for existing Invoice rows (WeasyPrint + S3).

`Invoice.generate_and_upload_pdf` skips work when `invoice_link` is already set,
so this command clears `invoice_link` via queryset.update (bypasses immutability
clean()), then calls generate_and_upload_pdf for each invoice.

Usage:
  python manage.py regenerate_invoice_pdfs --dry-run
  python manage.py regenerate_invoice_pdfs
  python manage.py regenerate_invoice_pdfs --from-number 1 --to-number 1072 --http-host landarsfood.com
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.test import RequestFactory

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Regenerate invoice PDFs for invoice_number in a range by clearing invoice_link "
        "and calling generate_and_upload_pdf."
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
            "--http-host",
            type=str,
            default="localhost",
            help="Host for RequestFactory (WeasyPrint base_url). Use landarsfood.com on server.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List invoices that would be processed; no DB/S3 changes.",
        )

    def handle(self, *args, **options):
        from billing.models import Invoice

        n_from: int = options["from_number"]
        n_to: int = options["to_number"]
        host: str = options["http_host"]
        dry_run: bool = options["dry_run"]

        qs = (
            Invoice.objects.filter(
                invoice_number__gte=n_from,
                invoice_number__lte=n_to,
            )
            .select_related("order", "order__customer")
            .order_by("invoice_number")
        )

        total = qs.count()
        self.stdout.write(
            self.style.NOTICE(
                f"Invoices in range [{n_from}, {n_to}]: {total} (host={host})"
            )
        )
        logger.info(
            "regenerate_invoice_pdfs: range=[%s,%s] count=%s host=%s dry_run=%s",
            n_from,
            n_to,
            total,
            host,
            dry_run,
        )

        if dry_run:
            for inv in qs.iterator(chunk_size=100):
                self.stdout.write(
                    f"  would regenerate invoice_number={inv.invoice_number} id={inv.pk} "
                    f"link={inv.invoice_link!r}"
                )
            self.stdout.write(self.style.WARNING("Dry run — no changes."))
            logger.info("regenerate_invoice_pdfs: dry-run exit")
            return

        rf = RequestFactory()
        request = rf.get("/", HTTP_HOST=host)

        ok = 0
        failed = 0
        for inv in qs.iterator(chunk_size=50):
            num = inv.invoice_number
            pk = inv.pk
            try:
                Invoice.objects.filter(pk=pk).update(invoice_link="")
                inv.refresh_from_db()
                inv.generate_and_upload_pdf(request)
                ok += 1
                logger.info(
                    "regenerate_invoice_pdfs: ok invoice_number=%s id=%s link=%s",
                    num,
                    pk,
                    inv.invoice_link,
                )
                if ok % 25 == 0:
                    self.stdout.write(f"  … {ok} done")
                    logger.info(
                        "regenerate_invoice_pdfs: progress %s/%s",
                        ok,
                        total,
                    )
            except Exception as exc:
                failed += 1
                logger.exception(
                    "regenerate_invoice_pdfs: failed invoice_number=%s id=%s",
                    num,
                    pk,
                )
                self.stderr.write(
                    self.style.ERROR(f"invoice_number={num} id={pk}: {exc}")
                )

        self.stdout.write(
            self.style.SUCCESS(f"Finished. Regenerated: {ok}, failed: {failed}.")
        )
        logger.info(
            "regenerate_invoice_pdfs: finished ok=%s failed=%s",
            ok,
            failed,
        )
