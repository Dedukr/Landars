"""
Management command to clean up expired password reset tokens.
This should be run periodically (e.g., via cron job) to maintain database hygiene.
"""

from account.models import PasswordResetToken
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Clean up expired password reset tokens"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without actually deleting",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        # Get expired tokens
        expired_tokens = PasswordResetToken.objects.filter(
            expires_at__lt=timezone.now()
        )

        count = expired_tokens.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No expired tokens found."))
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f"DRY RUN: Would delete {count} expired tokens")
            )
            # Show some examples
            for token in expired_tokens[:5]:
                self.stdout.write(
                    f"  - Token for {token.user.email} (expired: {token.expires_at})"
                )
            if count > 5:
                self.stdout.write(f"  ... and {count - 5} more")
        else:
            # Actually delete expired tokens
            deleted_count = PasswordResetToken.cleanup_expired_tokens()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully deleted {deleted_count} expired tokens."
                )
            )
