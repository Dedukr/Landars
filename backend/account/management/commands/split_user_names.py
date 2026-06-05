from django.core.management.base import BaseCommand

from account.models import CustomUser
from account.name_utils import split_legacy_name


class Command(BaseCommand):
    help = (
        "Populate first_name and surname from legacy name: "
        "two words → split; otherwise → first_name only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print changes without saving.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        updated = 0

        for user in CustomUser.objects.iterator():
            if user.first_name or user.surname:
                continue
            legacy = (user.name or "").strip()
            if not legacy:
                continue

            first_name, surname = split_legacy_name(legacy)
            if dry_run:
                self.stdout.write(
                    f"User {user.id} ({user.email}): {legacy!r} → "
                    f"first_name={first_name!r}, surname={surname!r}"
                )
            else:
                user.first_name = first_name
                user.surname = surname
                user.sync_computed_name()
                user.save(update_fields=["first_name", "surname", "name"])
            updated += 1

        verb = "Would update" if dry_run else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} {updated} user(s)."))
