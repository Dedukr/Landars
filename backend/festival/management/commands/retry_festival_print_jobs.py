from __future__ import annotations

from django.core.management.base import BaseCommand

from festival.models import FestivalPrintJob
from festival.services.cloudprnt import CloudPRNTError, create_retry_job


class Command(BaseCommand):
    help = "Create replacement print jobs for FAILED festival tickets."

    def add_arguments(self, parser):
        parser.add_argument(
            "--job-token",
            action="append",
            dest="tokens",
            default=[],
            help="Specific job token(s) to retry. Defaults to all FAILED jobs.",
        )

    def handle(self, *args, **options):
        qs = FestivalPrintJob.objects.filter(status=FestivalPrintJob.Status.FAILED)
        tokens = options["tokens"]
        if tokens:
            qs = qs.filter(job_token__in=tokens)
        count = 0
        for job in qs.order_by("created_at"):
            try:
                replacement = create_retry_job(job)
            except CloudPRNTError as exc:
                self.stderr.write(f"{job.job_token}: {exc}")
                continue
            count += 1
            self.stdout.write(
                f"Retried {job.job_token} -> {replacement.job_token}"
            )
        self.stdout.write(self.style.SUCCESS(f"Created {count} retry job(s)."))
