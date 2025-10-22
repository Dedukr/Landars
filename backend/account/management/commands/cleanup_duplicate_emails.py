"""
Management command to clean up duplicate emails and ensure email uniqueness.
"""

from collections import defaultdict

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

User = get_user_model()


class Command(BaseCommand):
    help = "Clean up duplicate emails and ensure email uniqueness"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No changes will be made")
            )

        # Find duplicate emails (case-insensitive)
        email_groups = defaultdict(list)

        for user in User.objects.filter(email__isnull=False):
            if user.email:
                email_groups[user.email.lower()].append(user)

        duplicates_found = False

        for email, users in email_groups.items():
            if len(users) > 1:
                duplicates_found = True
                self.stdout.write(
                    self.style.ERROR(f"Found {len(users)} users with email: {email}")
                )

                # Sort by creation date (oldest first)
                users.sort(
                    key=lambda u: u.date_joined if hasattr(u, "date_joined") else u.id
                )

                # Keep the first user, mark others for deletion
                keep_user = users[0]
                delete_users = users[1:]

                self.stdout.write(
                    f"  Keeping user: {keep_user.name} (ID: {keep_user.id})"
                )

                for user in delete_users:
                    self.stdout.write(
                        f"  Marking for deletion: {user.name} (ID: {user.id})"
                    )

                    if not dry_run:
                        # Set email to None to avoid constraint issues
                        user.email = None
                        user.save()
                        self.stdout.write(f"  Removed email from user: {user.name}")

        if not duplicates_found:
            self.stdout.write(self.style.SUCCESS("No duplicate emails found!"))
        else:
            if dry_run:
                self.stdout.write(
                    self.style.WARNING("Run without --dry-run to apply changes")
                )
            else:
                self.stdout.write(self.style.SUCCESS("Duplicate emails cleaned up!"))

        # Verify email uniqueness
        self.stdout.write("\nVerifying email uniqueness...")
        duplicate_count = 0

        for user in User.objects.filter(email__isnull=False):
            if user.email:
                count = User.objects.filter(email__iexact=user.email).count()
                if count > 1:
                    duplicate_count += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f"Still found duplicates for email: {user.email}"
                        )
                    )

        if duplicate_count == 0:
            self.stdout.write(self.style.SUCCESS("Email uniqueness verified!"))
        else:
            self.stdout.write(
                self.style.ERROR(
                    f"Found {duplicate_count} emails still with duplicates"
                )
            )
