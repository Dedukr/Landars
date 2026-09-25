"""Print the pseudonym that auth logs use for an email address.

    python manage.py auth_email_hash customer@example.com [more@example.com ...]

Auth events never contain the raw email, only ``email_hash`` (see
docs/AUTH_OBSERVABILITY.md). Run this in the same environment as the backend
(same SECRET_KEY, e.g. ``docker compose exec backend ...``) to find a customer's
events.
"""

from django.core.management.base import BaseCommand, CommandError

from account.email_normalization import normalize_email
from account.observability import hash_email

USAGE_HINT = """\
Find that customer's auth events (JSON lines on logger account.auth):
  docker compose logs --no-log-prefix --since 2h backend | grep '"email_hash":"<hash>"'
  ... | jq -R 'fromjson? | select(.email_hash == "<hash>")'
The hash is stable across casing, whitespace and zero-width characters; it changes
only if SECRET_KEY changes. Timestamps in events are UTC (ts)."""


class Command(BaseCommand):
    help = "Print the email_hash used in auth logs for one or more email addresses."

    def add_arguments(self, parser):
        parser.add_argument("emails", nargs="+", help="Email address(es) to hash")

    def handle(self, *args, **options):
        printed = 0
        for raw in options["emails"]:
            digest = hash_email(raw)
            if not digest:
                self.stderr.write(f"Skipping unusable email argument: {raw!r}")
                continue
            self.stdout.write(f"{digest}  {normalize_email(raw)}")
            printed += 1
        if not printed:
            raise CommandError("No usable email address given.")
        self.stderr.write(USAGE_HINT)
