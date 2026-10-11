"""Remove unreferenced development objects after replacing the active local DB."""
from pathlib import Path
import time

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import CharField, FileField, TextField, Q

from backend.file_storage import (
    IMAGE_ROUTE_MARKER, LOCAL_PREFIX, image_reference_from_value, is_development,
)


class Command(BaseCommand):
    help = "Delete only local files no longer referenced by the active development database."

    def add_arguments(self, parser):
        parser.add_argument("--after-database-refresh", action="store_true", help="Prune recent unlinked uploads too. Stop development writers first.")

    def handle(self, *args, **options):
        if not is_development():
            raise CommandError("Refusing development cleanup in production.")
        # Finish ALL database reads before deleting anything. A failed restore or
        # missing table must never be interpreted as an empty production database.
        references = set()
        for model in apps.get_models():
            if model._meta.proxy or not model._meta.managed:
                continue
            for field in model._meta.fields:
                if not isinstance(field, (CharField, FileField, TextField)):
                    continue
                for value in model.objects.filter(
                    Q(**{field.name + "__startswith": LOCAL_PREFIX}) |
                    Q(**{field.name + "__contains": IMAGE_ROUTE_MARKER})
                ).values_list(field.name, flat=True).iterator():
                    reference = image_reference_from_value(value)
                    if reference:
                        references.add(reference)
        root = Path(settings.DEVELOPMENT_FILE_ROOT).resolve()
        removed = 0
        for kind in ("documents", "images"):
            folder = root / kind
            if folder.is_symlink():
                raise CommandError("Refusing cleanup of a symlinked storage directory.")
            for path in folder.rglob("*"):
                if path.is_symlink() or not path.is_file():
                    continue
                # Keep the latest hour of unlinked uploads: a concurrent render/upload
                # may not have saved its DB reference yet. They can be pruned later.
                if not options["after_database_refresh"] and time.time() - path.stat().st_mtime < 3600:
                    continue
                reference = LOCAL_PREFIX + path.relative_to(root).as_posix()
                if reference not in references:
                    path.unlink()
                    removed += 1
        self.stdout.write(self.style.SUCCESS(f"Removed {removed} unreferenced development files; production storage untouched."))
