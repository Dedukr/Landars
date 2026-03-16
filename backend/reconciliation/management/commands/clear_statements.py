from django.core.management.base import BaseCommand

from reconciliation.models import BankTransaction, ReconciliationMatch, StatementBatch


class Command(BaseCommand):
    help = (
        "Delete all reconciliation data: statement batches, bank transactions, "
        "and reconciliation matches."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Skip confirmation prompt and delete immediately.",
        )

    def handle(self, *args, **options):
        force = options["force"]

        matches_count = ReconciliationMatch.objects.count()
        tx_count = BankTransaction.objects.count()
        batch_count = StatementBatch.objects.count()

        if matches_count == 0 and tx_count == 0 and batch_count == 0:
            self.stdout.write(self.style.WARNING("No reconciliation records to delete."))
            return

        summary = (
            f"This will delete:\n"
            f"  - {matches_count} reconciliation matches\n"
            f"  - {tx_count} bank transactions\n"
            f"  - {batch_count} statement batches\n"
        )
        self.stdout.write(summary)

        if not force:
            confirm = input("Type 'yes' to confirm deletion: ").strip().lower()
            if confirm != "yes":
                self.stdout.write(self.style.WARNING("Aborted. No records were deleted."))
                return

        # Delete in dependency-safe order: matches → transactions → batches
        ReconciliationMatch.objects.all().delete()
        BankTransaction.objects.all().delete()
        StatementBatch.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                "Deleted all reconciliation matches, bank transactions, and statement batches."
            )
        )

