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
        now = timezone.now()

        # Find expired tokens
        expired_tokens = PasswordResetToken.objects.filter(expires_at__lt=now)

        count = expired_tokens.count()

        if options["dry_run"]:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN: Would delete {count} expired password reset tokens"
                )
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
            deleted_count, _ = expired_tokens.delete()

            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully deleted {deleted_count} expired password reset tokens"
                )
            )
