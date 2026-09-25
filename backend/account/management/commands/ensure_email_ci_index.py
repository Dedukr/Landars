"""
Create the case-insensitive unique index on the user email (F12), no migration.

    manage.py ensure_email_ci_index --dry-run    # preflight: duplicates? SQL?
    manage.py ensure_email_ci_index              # create (idempotent)

The model's own ``unique=True`` index is case-sensitive, so ``A@x.com`` and
``a@x.com`` can coexist. This adds ``account_customuser_email_lower_uniq``
(unique on ``lower(email)`` where email is not null) as an *unmanaged* index:
Django's model state is unchanged, so ``makemigrations`` stays clean. It refuses
to run while case-insensitive duplicates exist (resolve them first; see
``check_auth_data``). PostgreSQL uses ``CREATE UNIQUE INDEX CONCURRENTLY`` (no
long write lock; must run outside a transaction, which a command does).
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.models import Count
from django.db.models.functions import Lower

from account.models import CustomUser

INDEX_NAME = "account_customuser_email_lower_uniq"


def duplicate_group_count():
    """Number of lower(email) values shared by more than one user (the index's view)."""
    return (
        CustomUser.objects.exclude(email__isnull=True)
        .order_by()
        .annotate(lower_email=Lower("email"))
        .values("lower_email")
        .annotate(n=Count("pk"))
        .filter(n__gt=1)
        .count()
    )


class Command(BaseCommand):
    help = (
        "Create the case-insensitive unique index on lower(email) (idempotent). Refuses "
        "when case-insensitive duplicate emails exist. No migration is involved."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Check for duplicates and print the SQL without changing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        vendor = connection.vendor
        if vendor not in ("postgresql", "sqlite"):
            raise CommandError(f"Unsupported database vendor '{vendor}' (postgresql/sqlite only).")
        if vendor == "postgresql" and connection.in_atomic_block and not dry_run:
            raise CommandError("CREATE INDEX CONCURRENTLY cannot run inside a transaction.")

        groups = duplicate_group_count()
        if groups:
            raise CommandError(
                f"Refusing to create {INDEX_NAME}: {groups} case-insensitive duplicate email "
                "group(s) exist. Resolve them first (run `check_auth_data` to list the user "
                "ids), then re-run."
            )

        quote = connection.ops.quote_name
        table, column, index = (
            quote(CustomUser._meta.db_table),
            quote("email"),
            quote(INDEX_NAME),
        )
        concurrently = "CONCURRENTLY " if vendor == "postgresql" else ""
        create_sql = (
            f"CREATE UNIQUE INDEX {concurrently}IF NOT EXISTS {index} "
            f"ON {table} (lower({column})) WHERE {column} IS NOT NULL"
        )
        state = self._index_state(vendor)

        if state == "valid":
            self.stdout.write(self.style.SUCCESS(f"{INDEX_NAME} already exists - nothing to do."))
            return

        drop_sql = f"DROP INDEX CONCURRENTLY IF EXISTS {index}"
        if state == "invalid":  # PostgreSQL only: a CONCURRENTLY build that was interrupted
            self.stdout.write(
                self.style.WARNING(f"{INDEX_NAME} exists but is INVALID (interrupted build).")
            )
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no duplicates found; would run:"))
            if state == "invalid":
                self.stdout.write(f"  {drop_sql}")
            self.stdout.write(f"  {create_sql}")
            return

        with connection.cursor() as cursor:
            if state == "invalid":
                cursor.execute(drop_sql)
            cursor.execute(create_sql)
        self.stdout.write(self.style.SUCCESS(f"Created unique index {INDEX_NAME} on lower(email)."))

    @staticmethod
    def _index_state(vendor):
        """None when absent, else "valid" / "invalid" (invalid is PostgreSQL only)."""
        with connection.cursor() as cursor:
            if vendor == "sqlite":
                cursor.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = %s",
                    [INDEX_NAME],
                )
                return "valid" if cursor.fetchone() else None
            cursor.execute(
                "SELECT i.indisvalid FROM pg_class c "
                "JOIN pg_index i ON i.indexrelid = c.oid "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE c.relname = %s AND n.nspname = current_schema()",
                [INDEX_NAME],
            )
            row = cursor.fetchone()
        if row is None:
            return None
        return "valid" if row[0] else "invalid"
