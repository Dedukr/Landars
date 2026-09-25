"""
Read-only audit of customer-authentication data.

Finds the legacy / partial states that turn login, email verification or
password reset into HTTP 500s or leave a sign-up stuck without a working link.
Never writes to the database. Output contains user ids only (no emails/PII).

    manage.py check_auth_data                      # human-readable report
    manage.py check_auth_data --json               # machine-readable
    manage.py check_auth_data --fail-on-issues     # exit code 1 on critical findings
"""

import json
from collections import Counter, defaultdict
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Exists, OuterRef
from django.utils import timezone

from account.email_normalization import normalize_email
from account.email_validators import validate_email_comprehensive
from account.models import (
    CustomUser,
    EmailVerificationToken,
    PasswordResetToken,
)

CRITICAL, WARNING, INFO = "critical", "warning", "info"

UNVERIFIED_GRACE = timedelta(hours=1)  # signup may still be in flight
UNSENT_GRACE = timedelta(minutes=10)  # Celery may still be delivering
MAX_TOKENS_PER_USER = 3
MAX_IDS_PER_GROUP = 10

# Only genuine format problems: disposable domains / typo hints still log in fine.
EMAIL_CHECK_OPTIONS = {"allow_disposable": True, "check_typos": False}


def users_without_valid_token(now, *, min_age, max_age=None):
    """Unverified, active website users with no unused+unexpired verification token.

    ``min_age``/``max_age`` bound ``created_at`` (older than ``min_age``, and
    not older than ``max_age`` when given). Shared with ``repair_auth_data``.
    """
    valid_token = EmailVerificationToken.objects.filter(
        user=OuterRef("pk"), is_used=False, expires_at__gt=now
    )
    users = CustomUser.objects.filter(
        is_email_verified=False,
        is_active=True,
        created_source=CustomUser.CREATED_SOURCE_WEBSITE,
        created_at__lt=now - min_age,
    ).filter(~Exists(valid_token))
    if max_age is not None:
        users = users.filter(created_at__gte=now - max_age)
    return users


def _finding(severity, title, count, ids=(), sample=5, **extra):
    return {
        "severity": severity,
        "title": title,
        "count": count,
        "sample_ids": sorted(set(ids))[:sample],
        **extra,
    }


class Command(BaseCommand):
    help = (
        "Read-only audit of authentication data (duplicate/invalid emails, users that "
        "fail validation, stuck email verification). Prints user ids only."
    )

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true", help="Emit the report as JSON.")
        parser.add_argument(
            "--sample",
            type=int,
            default=5,
            help="Max sample user ids shown per finding (default 5; ids only, never emails).",
        )
        parser.add_argument(
            "--fail-on-issues",
            action="store_true",
            help="Exit with code 1 when any critical finding exists.",
        )

    def handle(self, *args, **options):
        sample = options["sample"]
        if sample < 0:
            raise CommandError("--sample must be >= 0")
        now = timezone.now()

        checks = {}
        checks.update(self._email_checks(sample))
        checks["full_clean_failures"] = self._full_clean_check(sample)
        checks.update(self._verification_checks(now, sample))
        checks.update(self._informational_checks(now, sample))

        critical = [key for key, f in checks.items() if f["severity"] == CRITICAL and f["count"]]
        warnings = [key for key, f in checks.items() if f["severity"] == WARNING and f["count"]]
        report = {
            "generated_at": now.isoformat(),
            "summary": {
                "total_users": CustomUser.objects.count(),
                "critical_findings": len(critical),
                "warning_findings": len(warnings),
                "critical_checks": critical,
                "warning_checks": warnings,
                "ok": not critical,
            },
            "checks": checks,
        }

        if options["json"]:
            self.stdout.write(json.dumps(report, indent=2))
        else:
            self._print_report(report)

        if options["fail_on_issues"] and critical:
            raise CommandError(
                f"{len(critical)} critical finding(s): {', '.join(critical)}", returncode=1
            )

    # ------------------------------------------------------------------ checks

    def _email_checks(self, sample):
        """One pass over every user's email: duplicates, format, canonical form."""
        by_canonical = defaultdict(list)
        missing_login, missing_contact = [], []
        non_canonical, non_canonical_kinds = [], Counter()
        invalid, invalid_reasons = [], Counter()

        rows = CustomUser.objects.order_by("pk").values_list(
            "pk", "email", "created_source", "is_staff", "is_superuser"
        )
        for pk, email, source, is_staff, is_superuser in rows.iterator(chunk_size=2000):
            canonical = normalize_email(email) if email is not None else ""
            if not canonical:
                can_log_in = source == CustomUser.CREATED_SOURCE_WEBSITE or is_staff or is_superuser
                (missing_login if can_log_in else missing_contact).append(pk)
                continue
            by_canonical[canonical].append(pk)
            if email != canonical:
                non_canonical.append(pk)
                if email != email.strip():
                    non_canonical_kinds["whitespace"] += 1
                if email != email.lower():
                    non_canonical_kinds["uppercase"] += 1
                if email.strip().lower() != canonical:
                    non_canonical_kinds["invisible_or_unicode_compat"] += 1
            result = validate_email_comprehensive(email, EMAIL_CHECK_OPTIONS)
            if not result.is_valid:
                invalid.append(pk)
                invalid_reasons[result.error] += 1

        groups = sorted(
            (ids for ids in by_canonical.values() if len(ids) > 1), key=lambda ids: ids[0]
        )
        sample_groups = [ids[:MAX_IDS_PER_GROUP] for ids in groups[:sample]]
        return {
            "duplicate_emails": _finding(
                CRITICAL,
                "Case-insensitive duplicate emails (canonical form shared by several users)",
                len(groups),
                [pk for ids in sample_groups for pk in ids],
                sample,
                users=sum(len(ids) for ids in groups),
                sample_groups=sample_groups,
            ),
            "non_canonical_emails": _finding(
                WARNING,
                "Emails not in canonical form (uppercase / whitespace / zero-width / fullwidth)",
                len(non_canonical),
                non_canonical,
                sample,
                by_kind=dict(non_canonical_kinds),
            ),
            "missing_email": _finding(
                CRITICAL,
                "Website or staff users with NULL/blank email (cannot sign in)",
                len(missing_login),
                missing_login,
                sample,
            ),
            "missing_email_contact_only": _finding(
                INFO,
                "Admin/system contact-only users without email (allowed by design)",
                len(missing_contact),
                missing_contact,
                sample,
            ),
            "invalid_email_format": _finding(
                CRITICAL,
                "Emails failing validate_email_comprehensive",
                len(invalid),
                invalid,
                sample,
                by_reason=dict(invalid_reasons),
            ),
        }

    def _full_clean_check(self, sample):
        """Users whose full_clean() fails: any full save() of them raises."""
        failing, fields = [], Counter()
        for user in CustomUser.objects.order_by("pk").iterator(chunk_size=500):
            try:
                user.full_clean()
            except ValidationError as exc:
                failing.append(user.pk)
                fields.update(getattr(exc, "error_dict", {"__all__": None}).keys())
            except Exception:  # keep auditing; report the row as failing
                failing.append(user.pk)
                fields["__exception__"] += 1
        return _finding(
            CRITICAL,
            "Users failing full_clean() (full saves raise ValidationError)",
            len(failing),
            failing,
            sample,
            by_field=dict(fields),
        )

    def _verification_checks(self, now, sample):
        stuck = users_without_valid_token(now, min_age=UNVERIFIED_GRACE)
        stuck_ids = list(stuck.order_by("pk").values_list("pk", flat=True))

        unsent = EmailVerificationToken.objects.filter(
            email_sent_at__isnull=True,
            created_at__lt=now - UNSENT_GRACE,
            user__is_email_verified=False,
        )
        unsent_users = set(unsent.values_list("user_id", flat=True))
        still_valid = unsent.filter(is_used=False, expires_at__gt=now).count()

        heavy = list(
            EmailVerificationToken.objects.values("user_id")
            .annotate(n=Count("pk"))
            .filter(n__gt=MAX_TOKENS_PER_USER)
            .order_by("user_id")
            .values_list("user_id", "n")
        )
        return {
            "unverified_without_valid_token": _finding(
                CRITICAL,
                "Unverified active website users older than 1h with no valid verification token",
                len(stuck_ids),
                stuck_ids,
                sample,
            ),
            "tokens_never_sent": _finding(
                WARNING,
                "Verification tokens never emailed (email_sent_at NULL, older than 10 min, "
                "user unverified)",
                unsent.count(),
                unsent_users,
                sample,
                users=len(unsent_users),
                still_valid=still_valid,
            ),
            "users_with_many_tokens": _finding(
                WARNING,
                f"Users with more than {MAX_TOKENS_PER_USER} verification tokens",
                len(heavy),
                [user_id for user_id, _ in heavy],
                sample,
                max_tokens=max((n for _, n in heavy), default=0),
            ),
        }

    def _informational_checks(self, now, sample):
        inactive = CustomUser.objects.filter(is_active=False)
        by_source = dict(
            inactive.order_by().values_list("created_source").annotate(n=Count("pk"))
        )
        website_inactive = inactive.filter(
            created_source=CustomUser.CREATED_SOURCE_WEBSITE
        ).order_by("pk").values_list("pk", flat=True)[:sample]
        no_profile = CustomUser.objects.filter(profile__isnull=True)
        expired = {
            "verification": self._expired_counts(EmailVerificationToken, now),
            "password_reset": self._expired_counts(PasswordResetToken, now),
        }
        return {
            "inactive_users": _finding(
                INFO,
                "Inactive users by created_source (sample = inactive website users)",
                inactive.count(),
                website_inactive,
                sample,
                by_created_source=by_source,
            ),
            "users_without_profile": _finding(
                INFO,
                "Users without a Profile (created lazily on first use by design)",
                no_profile.count(),
                no_profile.order_by("pk").values_list("pk", flat=True)[:sample],
                sample,
            ),
            "expired_tokens": _finding(
                INFO,
                "Expired tokens still stored (cleanup_expired_tokens removes them)",
                sum(v["expired"] for v in expired.values()),
                (),
                sample,
                **expired,
            ),
        }

    @staticmethod
    def _expired_counts(model, now):
        expired = model.objects.filter(expires_at__lt=now)
        return {"expired": expired.count(), "expired_unused": expired.filter(is_used=False).count()}

    # ------------------------------------------------------------------ output

    def _print_report(self, report):
        summary = report["summary"]
        self.stdout.write(f"Auth data check (read-only) - {report['generated_at']}")
        self.stdout.write(f"Users: {summary['total_users']}\n")
        styles = {CRITICAL: self.style.ERROR, WARNING: self.style.WARNING, INFO: str}
        for key, finding in report["checks"].items():
            count = finding["count"]
            if not count and finding["severity"] != INFO:
                self.stdout.write(self.style.SUCCESS(f"[ OK ] {finding['title']}"))
                continue
            label = finding["severity"].upper()
            self.stdout.write(styles[finding["severity"]](f"[{label}] {finding['title']}: {count}"))
            extras = {
                k: v
                for k, v in finding.items()
                if k not in ("severity", "title", "count", "sample_ids", "sample_groups") and v
            }
            for name, value in extras.items():
                self.stdout.write(f"    {name}: {value}")
            if finding.get("sample_groups"):
                self.stdout.write(f"    sample groups (user ids): {finding['sample_groups']}")
            elif finding["sample_ids"]:
                self.stdout.write(f"    sample user ids: {finding['sample_ids']}")
        verdict = (
            self.style.SUCCESS("No critical findings.")
            if summary["ok"]
            else self.style.ERROR(f"{summary['critical_findings']} critical finding(s).")
        )
        self.stdout.write(f"\n{verdict} Warnings: {summary['warning_findings']}.")
