"""Auth data-integrity regressions (F10 / F11 / F12).

* legacy rows that fail ``full_clean()`` must still log in, verify and reset;
* email normalisation / case-insensitive uniqueness at the model layer;
* ``get_by_natural_key`` (Django ``authenticate`` / admin login) never raises
  ``MultipleObjectsReturned`` and tolerates differently-cased input;
* the ``check_auth_data`` / ``repair_auth_data`` / ``ensure_email_ci_index``
  management commands.

Legacy rows are created with ``bulk_create`` (no ``save()``, no validation, no
post_save merge signal) exactly like rows that pre-date the current rules.
"""

import json
from datetime import timedelta
from io import StringIO
from unittest import mock

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import (
    PBKDF2PasswordHasher,
    PBKDF2SHA1PasswordHasher,
    make_password,
)
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, connection, transaction
from django.db.models import Count
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from account.models import (
    CustomUser,
    EmailVerificationToken,
    PasswordResetToken,
    Profile,
)
from account.validators import validate_unique_email

User = get_user_model()

WEBSITE = CustomUser.CREATED_SOURCE_WEBSITE
INDEX_NAME = "account_customuser_email_lower_uniq"


class FastPBKDF2(PBKDF2PasswordHasher):
    iterations = 1000


class FastPBKDF2SHA1(PBKDF2SHA1PasswordHasher):
    iterations = 1000


# Cheap hashers (same code paths as production, 1000 iterations instead of 1M).
FAST_HASHERS = [
    f"{__name__}.FastPBKDF2",
    f"{__name__}.FastPBKDF2SHA1",
]


def make_user(email, *, verified=False, active=True, password=None, source=WEBSITE, **extra):
    """A valid user created through the manager (canonical email, validated)."""
    return User.objects.create_user(
        first_name=extra.pop("first_name", "Test"),
        surname=extra.pop("surname", "User"),
        email=email,
        password=password,
        is_email_verified=verified,
        is_active=active,
        created_source=source,
        **extra,
    )


def make_legacy(email, *, password=None, source=WEBSITE, **fields):
    """Insert a row bypassing save()/full_clean(), like a pre-existing prod row."""
    fields.setdefault("first_name", "Legacy")
    row = User(email=email, created_source=source, **fields)
    row.password = make_password(password)  # None -> unusable password
    User.objects.bulk_create([row])
    return User.objects.order_by("-pk").first()


def backdate(user, **delta):
    """Move created_at into the past (auto_now_add cannot be set on create)."""
    User.objects.filter(pk=user.pk).update(created_at=timezone.now() - timedelta(**delta))
    user.refresh_from_db()
    return user


def fails_full_clean(user):
    try:
        user.full_clean()
    except ValidationError:
        return True
    return False


class LegacyRowSaveTests(TestCase):
    """F11: system-field-only saves must not depend on full_clean()."""

    def setUp(self):
        self.lower = make_legacy("case.dup@example.com")
        self.upper = make_legacy("Case.Dup@example.com")
        self.bad_format = make_legacy("not-an-email")

    def legacy_rows(self):
        return {"lower-twin": self.lower, "upper-twin": self.upper, "bad-format": self.bad_format}

    def test_fixtures_really_fail_full_clean(self):
        for label, user in self.legacy_rows().items():
            with self.subTest(label):
                self.assertTrue(fails_full_clean(user))

    def test_is_email_verified_save_bypasses_validation(self):
        for label, user in self.legacy_rows().items():
            with self.subTest(label):
                user.is_email_verified = True
                user.save(update_fields=["is_email_verified"])
                user.refresh_from_db()
                self.assertTrue(user.is_email_verified)

    def test_password_save_bypasses_validation(self):
        for label, user in self.legacy_rows().items():
            with self.subTest(label):
                user.set_password("New-pass-123")
                user.save(update_fields=["password"])
                user.refresh_from_db()
                self.assertTrue(user.check_password("New-pass-123"))

    def test_last_login_save_bypasses_validation(self):
        stamp = timezone.now()
        for label, user in self.legacy_rows().items():
            with self.subTest(label):
                user.last_login = stamp
                user.save(update_fields=["last_login"])
                user.refresh_from_db()
                self.assertEqual(user.last_login, stamp)

    def test_is_active_save_bypasses_validation(self):
        for label, user in self.legacy_rows().items():
            with self.subTest(label):
                user.is_active = False
                user.save(update_fields=["is_active"])
                user.refresh_from_db()
                self.assertFalse(user.is_active)

    def test_combination_of_system_fields_bypasses_validation(self):
        self.bad_format.set_password("Another-pass-1")
        self.bad_format.is_email_verified = True
        self.bad_format.last_login = timezone.now()
        self.bad_format.save(
            update_fields=["password", "is_email_verified", "last_login", "is_active"]
        )
        self.bad_format.refresh_from_db()
        self.assertTrue(self.bad_format.is_email_verified)
        self.assertTrue(self.bad_format.check_password("Another-pass-1"))

    def test_fast_path_does_not_sync_name_or_rewrite_email(self):
        self.assertIsNone(self.upper.name)
        self.upper.is_email_verified = True
        self.upper.save(update_fields=["is_email_verified"])
        self.upper.refresh_from_db()
        self.assertIsNone(self.upper.name)  # a full save would derive it from first_name
        self.assertEqual(self.upper.email, "Case.Dup@example.com")

    def test_normal_save_still_validates(self):
        for label, user in self.legacy_rows().items():
            with self.subTest(label):
                with self.assertRaises(ValidationError):
                    user.save()

    def test_non_system_update_fields_still_validate(self):
        for update_fields in (["first_name"], ["email"], ["password", "first_name"]):
            with self.subTest(update_fields=update_fields):
                with self.assertRaises(ValidationError):
                    self.bad_format.save(update_fields=update_fields)

    def test_healthy_user_full_save_still_syncs_name(self):
        user = make_user("healthy@example.com", first_name="Ada", surname="Lovelace")
        user.first_name = "Grace"
        user.save()
        user.refresh_from_db()
        self.assertEqual(user.name, "Grace Lovelace")


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class PasswordRehashOnLegacyRowTests(TestCase):
    """Django rehashes on login (save(update_fields=['password'])); it must not 500."""

    def test_login_rehash_works_for_a_row_that_fails_full_clean(self):
        old_hash = make_password("Old-pass-123", hasher=FastPBKDF2SHA1())
        self.assertTrue(old_hash.startswith("pbkdf2_sha1$"))
        twin = make_legacy("rehash.me@example.com")
        make_legacy("Rehash.Me@example.com")  # case-twin -> twin fails full_clean()
        User.objects.filter(pk=twin.pk).update(password=old_hash)
        twin.refresh_from_db()
        self.assertTrue(fails_full_clean(twin))

        user = authenticate(username="rehash.me@example.com", password="Old-pass-123")

        self.assertEqual(user.pk, twin.pk)
        twin.refresh_from_db()
        self.assertTrue(twin.password.startswith("pbkdf2_sha256$"))
        self.assertTrue(twin.check_password("Old-pass-123"))


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class CreateUserNormalisationTests(TestCase):
    """F10: create_user uses normalize_email and rejects case variants."""

    def test_email_is_canonicalised(self):
        for raw in (
            "  MiXeD@Example.COM ",
            "mixed@example.com\u200b",
            "ｍｉｘｅｄ＠ｅｘａｍｐｌｅ．ｃｏｍ",
        ):
            with self.subTest(raw=raw):
                User.objects.filter(email="mixed@example.com").delete()
                self.assertEqual(make_user(raw).email, "mixed@example.com")

    def test_canonical_email_is_persisted(self):
        user = make_user("  Persist@Example.COM ")
        self.assertEqual(User.objects.get(pk=user.pk).email, "persist@example.com")

    def test_rejects_case_variant_of_existing_user(self):
        make_user("taken@example.com")
        for raw in ("TAKEN@example.com", " Taken@Example.com ", "taken@example.com"):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError) as ctx:
                    make_user(raw)
                self.assertEqual(str(ctx.exception), "A user with this email already exists")
        self.assertEqual(User.objects.filter(email__iexact="taken@example.com").count(), 1)

    def test_rejects_case_variant_of_legacy_mixed_case_row(self):
        make_legacy("Legacy.Mixed@Example.com")
        with self.assertRaises(ValueError) as ctx:
            make_user("legacy.mixed@example.com")
        self.assertEqual(str(ctx.exception), "A user with this email already exists")
        self.assertEqual(User.objects.filter(email__iexact="legacy.mixed@example.com").count(), 1)

    def test_missing_or_blank_email_is_rejected(self):
        for raw in (None, "", "   ", "\u200b", 123, ["a@b.c"]):
            with self.subTest(raw=repr(raw)):
                with self.assertRaises(ValueError) as ctx:
                    User.objects.create_user(first_name="No", email=raw, password="x")
                self.assertEqual(str(ctx.exception), "Email must be set")

    def test_create_superuser_uses_the_same_normalisation(self):
        admin = User.objects.create_superuser(
            name="Root Admin", email=" ROOT@Example.com ", password="Sup3r-pass"
        )
        self.assertEqual(admin.email, "root@example.com")
        with self.assertRaises(ValueError):
            User.objects.create_superuser(name="Other Admin", email="Root@example.com", password="x")


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class GetByNaturalKeyTests(TestCase):
    """Django's ModelBackend / admin login resolve users through this method."""

    def test_exact_match_on_normalised_value_wins_over_lower_id(self):
        mixed = make_legacy("Mixed@Example.com")  # lower id, not canonical
        canonical = make_legacy("mixed@example.com")
        self.assertLess(mixed.pk, canonical.pk)
        for key in ("mixed@example.com", "MIXED@example.com", "  Mixed@Example.COM "):
            with self.subTest(key=key):
                self.assertEqual(User.objects.get_by_natural_key(key).pk, canonical.pk)

    def test_case_insensitive_fallback_for_legacy_mixed_case_row(self):
        legacy = make_legacy("Legacy.User@Example.com")
        for key in ("legacy.user@example.com", "LEGACY.USER@EXAMPLE.COM", "Legacy.User@Example.com"):
            with self.subTest(key=key):
                self.assertEqual(User.objects.get_by_natural_key(key).pk, legacy.pk)

    def test_several_case_variants_pick_lowest_id_and_never_raise(self):
        first = make_legacy("Dup@Example.com")
        make_legacy("dup@Example.com")
        make_legacy("DUP@example.com")
        self.assertEqual(User.objects.get_by_natural_key("dup@example.com").pk, first.pk)
        self.assertEqual(User.objects.get_by_natural_key("DUP@EXAMPLE.COM").pk, first.pk)

    def test_input_is_normalised(self):
        user = make_user("norm@example.com")
        for key in ("  norm@example.com  ", "norm@example.com\u200b", "ｎｏｒｍ＠ｅｘａｍｐｌｅ．ｃｏｍ"):
            with self.subTest(key=key):
                self.assertEqual(User.objects.get_by_natural_key(key).pk, user.pk)

    def test_missing_user_raises_does_not_exist(self):
        make_user("someone@example.com")
        for key in ("nobody@example.com", "", "   ", None, 123, ["someone@example.com"]):
            with self.subTest(key=repr(key)):
                with self.assertRaises(User.DoesNotExist):
                    User.objects.get_by_natural_key(key)

    def test_null_email_rows_never_match(self):
        make_legacy(None)
        with self.assertRaises(User.DoesNotExist):
            User.objects.get_by_natural_key("")

    def test_exact_lookup_is_a_single_query(self):
        make_user("fast@example.com")
        with self.assertNumQueries(1):
            User.objects.get_by_natural_key("FAST@example.com")

    def test_works_through_db_manager(self):
        user = make_user("routed@example.com")
        self.assertEqual(User.objects.db_manager("default").get_by_natural_key("Routed@Example.com").pk, user.pk)

    def test_authenticate_accepts_differently_cased_input(self):
        user = make_user("mixedcase@example.com", password="Correct-horse-1")
        for username in ("MixedCase@Example.com", "  MIXEDCASE@EXAMPLE.COM ", "mixedcase@example.com"):
            with self.subTest(username=username):
                found = authenticate(username=username, password="Correct-horse-1")
                self.assertIsNotNone(found)
                self.assertEqual(found.pk, user.pk)

    def test_authenticate_wrong_password_and_unknown_user(self):
        make_user("wrongpw@example.com", password="Correct-horse-1")
        self.assertIsNone(authenticate(username="WrongPw@example.com", password="nope"))
        self.assertIsNone(authenticate(username="ghost@example.com", password="Correct-horse-1"))

    def test_authenticate_rejects_inactive_user(self):
        make_user("inactive@example.com", password="Correct-horse-1", active=False)
        self.assertIsNone(authenticate(username="INACTIVE@example.com", password="Correct-horse-1"))

    def test_authenticate_with_legacy_mixed_case_row(self):
        legacy = make_legacy("Legacy.Login@Example.com", password="Correct-horse-1")
        found = authenticate(username="legacy.login@example.com", password="Correct-horse-1")
        self.assertEqual(found.pk, legacy.pk)

    def test_authenticate_with_case_duplicates_does_not_raise(self):
        first = make_legacy("Twin@Example.com", password="Correct-horse-1")
        make_legacy("TWIN@example.com", password="Other-pass-2")
        found = authenticate(username="twin@example.com", password="Correct-horse-1")
        self.assertEqual(found.pk, first.pk)
        self.assertIsNone(authenticate(username="twin@example.com", password="wrong"))


class ValidateUniqueEmailTests(TestCase):
    """F10: the validator compares case-insensitively on the normalised value."""

    def test_case_and_whitespace_variants_are_taken(self):
        make_user("taken@example.com")
        for raw in ("taken@example.com", "TAKEN@Example.com", "  Taken@example.com  ", "taken@example.com\u200b"):
            with self.subTest(raw=raw):
                with self.assertRaises(ValidationError) as ctx:
                    validate_unique_email(raw)
                self.assertEqual(ctx.exception.code, "email_exists")
                self.assertIn("already exists", ctx.exception.messages[0])

    def test_legacy_mixed_case_row_counts_as_taken(self):
        make_legacy("Legacy.Taken@Example.com")
        with self.assertRaises(ValidationError):
            validate_unique_email("legacy.taken@example.com")

    def test_free_and_empty_values_pass(self):
        make_user("someone@example.com")
        for raw in ("free@example.com", "", None, "   ", "\u200b", 123):
            with self.subTest(raw=repr(raw)):
                self.assertIsNone(validate_unique_email(raw))

    def test_exclude_user_id_ignores_only_that_row(self):
        mine = make_legacy("Mine@Example.com")
        validate_unique_email("mine@example.com", exclude_user_id=mine.pk)  # no error
        other = make_legacy("MINE@example.com")
        with self.assertRaises(ValidationError):
            validate_unique_email("mine@example.com", exclude_user_id=mine.pk)
        with self.assertRaises(ValidationError):
            validate_unique_email("mine@example.com", exclude_user_id=other.pk)

    def test_model_clean_normalises_and_uses_the_validator(self):
        make_user("clean@example.com")
        candidate = User(first_name="Cand", email=" CLEAN@Example.com\u200b ")
        with self.assertRaises(ValidationError):
            candidate.clean()
        fresh = User(first_name="Fresh", email=" Fresh@Example.com\u200b ")
        fresh.clean()
        self.assertEqual(fresh.email, "fresh@example.com")


def make_token(user, *, sent=True, age_minutes=0, expired=False, used=False):
    """Verification token in a chosen state (created_at/expiry are set via update())."""
    token = EmailVerificationToken.objects.create(user=user)
    now = timezone.now()
    EmailVerificationToken.objects.filter(pk=token.pk).update(
        created_at=now - timedelta(minutes=age_minutes),
        expires_at=now - timedelta(minutes=1) if expired else now + timedelta(hours=23),
        email_sent_at=now - timedelta(minutes=age_minutes) if sent else None,
        is_used=used,
    )
    token.refresh_from_db()
    return token


def run_command(name, *args, **kwargs):
    out, err = StringIO(), StringIO()
    try:
        call_command(name, *args, stdout=out, stderr=err, **kwargs)
    except CommandError as exc:
        exc.stdout, exc.stderr = out.getvalue(), err.getvalue()
        raise
    return out.getvalue(), err.getvalue()


def run_json(name, *args, **kwargs):
    out, _ = run_command(name, "--json", *args, **kwargs)
    return json.loads(out)


def snapshot():
    """Every user/token row, to prove read-only commands and dry-runs change nothing."""
    return (
        list(User.objects.order_by("pk").values()),
        list(EmailVerificationToken.objects.order_by("pk").values()),
    )


class CheckAuthDataTests(TestCase):
    """F12: read-only audit of a database in a messy, partially broken state."""

    @classmethod
    def setUpTestData(cls):
        cls.ok = make_user("ok@example.com", verified=True)
        Profile.objects.create(user=cls.ok)
        # case-insensitive duplicates: plain case pair + whitespace variant pair
        cls.dup_a = make_legacy("Dup.User@example.com")
        cls.dup_b = make_legacy("dup.user@example.com")
        cls.spaced = make_legacy("  spaced@example.com")
        cls.spaced_twin = make_legacy("spaced@example.com")
        cls.upper = make_legacy("Upper@Example.com")  # non-canonical only
        cls.bad_format = make_legacy("not-an-email")
        cls.no_email_web = make_legacy(None)  # website user that can never sign in
        cls.no_email_admin = make_legacy(None, source="admin")  # contact-only: by design
        cls.blank_admin = make_legacy("", source="admin")
        # verification pipeline states (created_at backdated past the 1h grace)
        cls.stuck = backdate(make_user("stuck@example.com"), hours=3)
        cls.expired_only = backdate(make_user("expired.only@example.com"), hours=30)
        make_token(cls.expired_only, expired=True, age_minutes=1800)
        cls.fresh = make_user("fresh@example.com")  # inside the grace period
        cls.with_token = backdate(make_user("with.token@example.com"), hours=3)
        make_token(cls.with_token, age_minutes=170)
        cls.unsent = backdate(make_user("unsent@example.com"), hours=2)
        make_token(cls.unsent, sent=False, age_minutes=30)
        cls.many = backdate(make_user("many.tokens@example.com"), hours=3)
        for _ in range(4):
            make_token(cls.many, age_minutes=100)
        cls.inactive_web = make_user("inactive.web@example.com", active=False, verified=True)
        # distinct name: admin-created users go through the auto-merge signal
        cls.inactive_admin = make_user(
            "inactive.admin@example.com", active=False, source="admin",
            first_name="Mallory", surname="Quartz",
        )
        PasswordResetToken.objects.create(
            user=cls.ok, expires_at=timezone.now() - timedelta(hours=1)
        )

    def check(self, *args):
        return run_json("check_auth_data", "--sample", "50", *args)["checks"]

    def test_json_shape(self):
        report = run_json("check_auth_data")
        self.assertEqual(set(report), {"generated_at", "summary", "checks"})
        self.assertEqual(
            set(report["summary"]),
            {"total_users", "critical_findings", "warning_findings", "critical_checks",
             "warning_checks", "ok"},
        )
        self.assertEqual(report["summary"]["total_users"], User.objects.count())
        self.assertFalse(report["summary"]["ok"])
        for key, finding in report["checks"].items():
            with self.subTest(key):
                self.assertLessEqual({"severity", "title", "count", "sample_ids"}, set(finding))
                self.assertIn(finding["severity"], {"critical", "warning", "info"})
                self.assertTrue(all(isinstance(pk, int) for pk in finding["sample_ids"]))

    def test_critical_and_warning_classification(self):
        summary = run_json("check_auth_data")["summary"]
        self.assertEqual(
            sorted(summary["critical_checks"]),
            ["duplicate_emails", "full_clean_failures", "invalid_email_format",
             "missing_email", "unverified_without_valid_token"],
        )
        self.assertEqual(
            sorted(summary["warning_checks"]),
            ["non_canonical_emails", "tokens_never_sent", "users_with_many_tokens"],
        )

    def test_duplicate_groups_count_ids_and_whitespace_variants(self):
        found = self.check()["duplicate_emails"]
        self.assertEqual((found["count"], found["users"]), (2, 4))
        groups = sorted(found["sample_groups"])
        self.assertEqual(
            groups,
            sorted([[self.dup_a.pk, self.dup_b.pk], [self.spaced.pk, self.spaced_twin.pk]]),
        )

    def test_non_canonical_invalid_and_missing_emails(self):
        checks = self.check()
        self.assertEqual(
            sorted(checks["non_canonical_emails"]["sample_ids"]),
            sorted([self.dup_a.pk, self.spaced.pk, self.upper.pk]),
        )
        self.assertEqual(
            checks["non_canonical_emails"]["by_kind"], {"uppercase": 2, "whitespace": 1}
        )
        self.assertEqual(checks["invalid_email_format"]["sample_ids"], [self.bad_format.pk])
        self.assertEqual(checks["missing_email"]["sample_ids"], [self.no_email_web.pk])
        self.assertEqual(
            sorted(checks["missing_email_contact_only"]["sample_ids"]),
            sorted([self.no_email_admin.pk, self.blank_admin.pk]),
        )
        self.assertEqual(checks["missing_email_contact_only"]["severity"], "info")

    def test_full_clean_failures_lists_users_that_cannot_be_fully_saved(self):
        failing = set(self.check()["full_clean_failures"]["sample_ids"])
        self.assertLessEqual(
            {self.dup_a.pk, self.dup_b.pk, self.spaced.pk, self.bad_format.pk}, failing
        )
        self.assertNotIn(self.ok.pk, failing)
        self.assertNotIn(self.with_token.pk, failing)

    def test_verification_pipeline_findings(self):
        checks = self.check()
        self.assertEqual(
            sorted(checks["unverified_without_valid_token"]["sample_ids"]),
            sorted([self.stuck.pk, self.expired_only.pk]),  # `fresh` is inside the 1h grace
        )
        never_sent = checks["tokens_never_sent"]
        self.assertEqual(
            (never_sent["count"], never_sent["users"], never_sent["still_valid"]), (1, 1, 1)
        )
        self.assertEqual(never_sent["sample_ids"], [self.unsent.pk])
        many = checks["users_with_many_tokens"]
        self.assertEqual((many["count"], many["max_tokens"]), (1, 4))
        self.assertEqual(many["sample_ids"], [self.many.pk])

    def test_informational_findings(self):
        checks = self.check()
        inactive = checks["inactive_users"]
        self.assertEqual(inactive["count"], 2)
        self.assertEqual(inactive["by_created_source"], {"website": 1, "admin": 1})
        self.assertEqual(inactive["sample_ids"], [self.inactive_web.pk])
        self.assertEqual(
            checks["users_without_profile"]["count"], User.objects.count() - 1  # only `ok` has one
        )
        expired = checks["expired_tokens"]
        self.assertEqual(expired["verification"], {"expired": 1, "expired_unused": 1})
        self.assertEqual(expired["password_reset"], {"expired": 1, "expired_unused": 1})
        self.assertEqual(expired["count"], 2)

    def test_output_contains_ids_only_never_emails(self):
        emails = [e for e in User.objects.values_list("email", flat=True) if e and e.strip()]
        for args in ((), ("--json",)):
            text, _ = run_command("check_auth_data", "--sample", "50", *args)
            lowered = text.lower()
            for email in emails:
                with self.subTest(args=args, email=email):
                    self.assertNotIn(email.strip().lower(), lowered)
            self.assertNotIn("example.com", lowered)

    def test_human_readable_report_flags_critical_findings(self):
        text, _ = run_command("check_auth_data")
        self.assertIn("[CRITICAL] Case-insensitive duplicate emails", text)
        self.assertIn("critical finding(s)", text)
        self.assertIn(str(self.stuck.pk), text)

    def test_sample_limits_ids(self):
        checks = run_json("check_auth_data", "--sample", "1")["checks"]
        for key, finding in checks.items():
            with self.subTest(key):
                self.assertLessEqual(len(finding["sample_ids"]), 1)
        self.assertEqual(len(checks["duplicate_emails"]["sample_groups"]), 1)
        none = run_json("check_auth_data", "--sample", "0")["checks"]
        self.assertTrue(all(f["sample_ids"] == [] for f in none.values()))
        self.assertEqual(none["duplicate_emails"]["count"], 2)  # counts are unaffected
        with self.assertRaises(CommandError):
            run_command("check_auth_data", "--sample", "-1")

    def test_default_sample_is_five(self):
        for i in range(7):
            make_legacy(f"bad-{i}")
        finding = run_json("check_auth_data")["checks"]["invalid_email_format"]
        self.assertEqual(len(finding["sample_ids"]), 5)
        self.assertEqual(finding["count"], 8)

    def test_fail_on_issues_exits_1_but_still_prints_the_report(self):
        with self.assertRaises(CommandError) as ctx:
            run_command("check_auth_data", "--json", "--fail-on-issues")
        self.assertEqual(ctx.exception.returncode, 1)
        self.assertIn("duplicate_emails", str(ctx.exception))
        self.assertFalse(json.loads(ctx.exception.stdout)["summary"]["ok"])
        run_command("check_auth_data")  # without the flag the exit code stays 0

    def test_command_is_read_only(self):
        before = snapshot()
        for args in ((), ("--json",), ("--fail-on-issues",)):
            try:
                run_command("check_auth_data", *args)
            except CommandError:
                pass
        self.assertEqual(snapshot(), before)


class CheckAuthDataCleanDatabaseTests(TestCase):
    def test_warnings_do_not_fail_and_healthy_data_is_ok(self):
        make_user("healthy@example.com", verified=True)
        make_legacy("Upper.Only@Example.com", is_email_verified=True)  # warning, not critical
        text, _ = run_command("check_auth_data", "--fail-on-issues")  # exit 0
        self.assertIn("No critical findings", text)
        report = run_json("check_auth_data", "--fail-on-issues")
        self.assertTrue(report["summary"]["ok"])
        self.assertEqual(report["summary"]["warning_checks"], ["non_canonical_emails"])

    def test_empty_database(self):
        report = run_json("check_auth_data", "--fail-on-issues")
        self.assertEqual(report["summary"]["total_users"], 0)
        self.assertTrue(report["summary"]["ok"])


class RepairNormalizeEmailsTests(TestCase):
    """--normalize-emails: canonicalise only rows with no clash; report the rest."""

    def setUp(self):
        self.upper = make_legacy("Upper.Case@Example.com")
        self.padded = make_legacy("  padded@example.com ")
        self.zero_width = make_legacy("zero\u200bwidth@example.com")
        self.clash_a = make_legacy("Clash@Example.com")
        self.clash_b = make_legacy("clash@example.com")  # already the canonical form
        self.both_a = make_legacy("Both@Example.com")  # neither twin is canonical:
        self.both_b = make_legacy("BOTH@example.com")  # ambiguous, never guess
        self.fine = make_user("fine@example.com")
        self.no_email = make_legacy(None)
        self.fixable = sorted([self.upper.pk, self.padded.pk, self.zero_width.pk])
        self.conflicts = sorted(
            [sorted([self.clash_a.pk, self.clash_b.pk]), sorted([self.both_a.pk, self.both_b.pk])]
        )

    def test_requires_an_action(self):
        with self.assertRaises(CommandError) as ctx:
            run_command("repair_auth_data")
        self.assertIn("Select at least one action", str(ctx.exception))
        with self.assertRaises(CommandError):
            run_command("repair_auth_data", "--apply")

    def test_dry_run_is_the_default_and_changes_nothing(self):
        before = snapshot()
        data = run_json("repair_auth_data", "--normalize-emails")
        self.assertEqual(data["mode"], "dry-run")
        result = data["normalize_emails"]
        self.assertEqual(result["candidates"], 3)
        self.assertEqual(result["would_update"], self.fixable)
        self.assertEqual(result["conflict_groups"], self.conflicts)
        self.assertNotIn("updated", result)
        self.assertEqual(snapshot(), before)
        text, _ = run_command("repair_auth_data", "--normalize-emails")
        self.assertIn("DRY RUN", text)
        self.assertEqual(snapshot(), before)

    def test_apply_updates_only_unambiguous_rows(self):
        before = {row["id"]: row for row in snapshot()[0]}
        data = run_json("repair_auth_data", "--normalize-emails", "--apply")
        self.assertEqual(data["mode"], "apply")
        result = data["normalize_emails"]
        self.assertEqual(result["updated"], self.fixable)
        self.assertEqual(result["conflict_groups"], self.conflicts)
        self.assertEqual((result["failed"], result["skipped_changed"]), ([], []))

        after = {row["id"]: row for row in snapshot()[0]}
        self.assertEqual(set(after), set(before))  # nothing deleted or merged
        expected = {
            self.upper.pk: "upper.case@example.com",
            self.padded.pk: "padded@example.com",
            self.zero_width.pk: "zerowidth@example.com",
        }
        for pk, row in after.items():
            with self.subTest(pk=pk):
                if pk in expected:
                    self.assertEqual(row["email"], expected[pk])
                    row = {**row, "email": before[pk]["email"]}
                # everything else, passwords included, is byte-for-byte unchanged
                self.assertEqual(row, before[pk])
        for pk in (self.upper.pk, self.padded.pk, self.zero_width.pk):
            User.objects.get(pk=pk).full_clean()  # the repaired rows are healthy

    def test_second_apply_is_a_noop(self):
        run_command("repair_auth_data", "--normalize-emails", "--apply")
        before = snapshot()
        result = run_json("repair_auth_data", "--normalize-emails", "--apply")["normalize_emails"]
        self.assertEqual((result["candidates"], result["updated"]), (0, []))
        self.assertEqual(result["conflict_groups"], self.conflicts)
        self.assertEqual(snapshot(), before)

    def test_one_failing_row_does_not_abort_the_batch(self):
        from django.db.models import QuerySet

        real_update = QuerySet.update

        def flaky(qs, **kwargs):
            if kwargs.get("email") == "upper.case@example.com":
                raise RuntimeError("boom for upper.case@example.com")
            return real_update(qs, **kwargs)

        with mock.patch.object(QuerySet, "update", flaky):
            out, err = run_command("repair_auth_data", "--normalize-emails", "--apply", "--json")
        result = json.loads(out)["normalize_emails"]
        self.assertEqual(result["failed"], [self.upper.pk])
        self.assertEqual(result["updated"], sorted([self.padded.pk, self.zero_width.pk]))
        self.assertIn(f"user {self.upper.pk} failed (RuntimeError)", err)
        self.assertNotIn("example.com", err)  # class name only, never exception text
        self.assertEqual(User.objects.get(pk=self.upper.pk).email, "Upper.Case@Example.com")

    def test_integrity_error_is_reported_as_a_conflict(self):
        from django.db.models import QuerySet

        real_update = QuerySet.update

        def clash(qs, **kwargs):
            if kwargs.get("email") == "padded@example.com":
                raise IntegrityError("UNIQUE constraint failed")
            return real_update(qs, **kwargs)

        with mock.patch.object(QuerySet, "update", clash):
            result = run_json("repair_auth_data", "--normalize-emails", "--apply")["normalize_emails"]
        self.assertIn([self.padded.pk], result["conflict_groups"])
        self.assertEqual(result["failed"], [])
        self.assertEqual(result["updated"], sorted([self.upper.pk, self.zero_width.pk]))


class RepairTokensTests(TestCase):
    """--issue-tokens / --resend-verification target selection and safety."""

    def setUp(self):
        self.needs1 = backdate(make_user("needs1@example.com"), hours=2)  # no token
        self.needs2 = backdate(make_user("needs2@example.com"), hours=30)
        make_token(self.needs2, expired=True, age_minutes=1800)  # expired token only
        self.used_only = backdate(make_user("used.only@example.com"), hours=5)
        make_token(self.used_only, used=True, age_minutes=300)  # used token only
        self.has_valid = backdate(make_user("has.valid@example.com"), hours=2)
        make_token(self.has_valid, age_minutes=100)  # valid and already emailed
        self.unsent = backdate(make_user("unsent@example.com"), hours=2)
        self.unsent_token = make_token(self.unsent, sent=False, age_minutes=60)  # valid, never emailed
        self.fresh = make_user("fresh@example.com")  # younger than --min-age-minutes
        self.too_old = backdate(make_user("too.old@example.com"), days=30)  # older than --max-age-days
        self.verified = backdate(make_user("verified@example.com", verified=True), hours=5)
        self.inactive = backdate(make_user("inactive@example.com", active=False), hours=5)
        self.admin_made = backdate(
            make_user("admin.made@example.com", source="admin", first_name="Zed", surname="Quartz"),
            hours=5,
        )
        self.candidates = sorted([self.needs1.pk, self.needs2.pk, self.used_only.pk])
        patcher = mock.patch("account.tasks.send_verification_email_task.delay")
        self.delay = patcher.start()
        self.addCleanup(patcher.stop)

    def token_counts(self):
        return dict(
            User.objects.order_by("pk")
            .values_list("pk")
            .annotate(n=Count("email_verification_tokens"))
        )

    def test_issue_tokens_dry_run_creates_nothing(self):
        before = snapshot()
        data = run_json("repair_auth_data", "--issue-tokens")
        result = data["tokens"]
        self.assertEqual(result["would_issue"], self.candidates)
        self.assertEqual(result["eligible"], {"no_valid_token": 3})
        self.assertNotIn("would_queue", result)
        self.assertEqual(snapshot(), before)
        self.delay.assert_not_called()

    def test_issue_tokens_apply_creates_one_valid_unsent_token_each(self):
        counts = self.token_counts()
        passwords = dict(User.objects.values_list("pk", "password"))
        result = run_json("repair_auth_data", "--issue-tokens", "--apply")["tokens"]
        self.assertEqual(result["issued"], self.candidates)
        self.assertNotIn("queued", result)
        after = self.token_counts()
        for pk in User.objects.values_list("pk", flat=True):
            with self.subTest(pk=pk):
                self.assertEqual(after[pk], counts[pk] + (1 if pk in self.candidates else 0))
        for pk in self.candidates:
            new = EmailVerificationToken.objects.filter(user_id=pk).order_by("-pk").first()
            self.assertTrue(new.is_valid())
            self.assertIsNone(new.email_sent_at)  # no email is sent by --issue-tokens
            self.assertEqual(new.user_agent, "repair_auth_data")
        self.delay.assert_not_called()
        self.assertEqual(dict(User.objects.values_list("pk", "password")), passwords)

    def test_repeat_run_is_idempotent(self):
        run_command("repair_auth_data", "--issue-tokens", "--apply")
        before = snapshot()
        result = run_json("repair_auth_data", "--issue-tokens", "--apply")["tokens"]
        self.assertEqual((result["issued"], result["selected"]), ([], 0))
        self.assertEqual(snapshot(), before)

    def test_limit_and_age_window_options(self):
        result = run_json("repair_auth_data", "--issue-tokens", "--limit", "1")["tokens"]
        self.assertEqual(result["would_issue"], self.candidates[:1])
        self.assertEqual((result["selected"], result["eligible"]["no_valid_token"]), (1, 3))
        result = run_json("repair_auth_data", "--issue-tokens", "--min-age-minutes", "0")["tokens"]
        self.assertEqual(result["would_issue"], sorted(self.candidates + [self.fresh.pk]))
        result = run_json("repair_auth_data", "--issue-tokens", "--max-age-days", "60")["tokens"]
        self.assertEqual(result["would_issue"], sorted(self.candidates + [self.too_old.pk]))
        for bad in (["--limit", "0"], ["--max-age-days", "0"], ["--min-age-minutes", "-1"]):
            with self.subTest(bad=bad), self.assertRaises(CommandError):
                run_command("repair_auth_data", "--issue-tokens", *bad)

    def test_resend_dry_run_queues_nothing(self):
        before = snapshot()
        result = run_json("repair_auth_data", "--resend-verification")["tokens"]
        self.assertEqual(result["would_issue"], self.candidates)
        self.assertEqual(result["would_queue"], sorted(self.candidates + [self.unsent.pk]))
        self.assertEqual(result["eligible"], {"no_valid_token": 3, "valid_token_never_emailed": 1})
        self.assertEqual(snapshot(), before)
        self.delay.assert_not_called()

    def test_resend_apply_queues_the_task_for_a_valid_token(self):
        counts = self.token_counts()
        result = run_json("repair_auth_data", "--resend-verification", "--apply")["tokens"]
        self.assertEqual(result["issued"], self.candidates)
        self.assertEqual(result["queued"], sorted(self.candidates + [self.unsent.pk]))
        queued_tokens = sorted(call.args[0] for call in self.delay.call_args_list)
        expected = sorted(
            [self.unsent_token.pk]
            + [
                EmailVerificationToken.objects.filter(user_id=pk).order_by("-pk").first().pk
                for pk in self.candidates
            ]
        )
        self.assertEqual(queued_tokens, expected)
        self.assertEqual(self.delay.call_count, 4)
        after = self.token_counts()
        self.assertEqual(after[self.unsent.pk], counts[self.unsent.pk])  # reused, not re-issued
        self.assertEqual(after[self.has_valid.pk], counts[self.has_valid.pk])  # already emailed

    def test_issue_and_resend_together_do_not_double_issue(self):
        run_command("repair_auth_data", "--issue-tokens", "--resend-verification", "--apply")
        for pk in self.candidates:
            valid = EmailVerificationToken.objects.filter(
                user_id=pk, is_used=False, expires_at__gt=timezone.now()
            )
            self.assertEqual(valid.count(), 1)

    def test_broker_failure_is_isolated_per_user_and_retried_next_run(self):
        self.delay.side_effect = [RuntimeError("broker down for needs1@example.com"), None, None, None]
        out, err = run_command("repair_auth_data", "--resend-verification", "--apply", "--json")
        result = json.loads(out)["tokens"]
        self.assertEqual(result["failed"], [self.needs1.pk])
        self.assertEqual(sorted(result["queued"]), sorted(self.candidates[1:] + [self.unsent.pk]))
        self.assertIn(f"user {self.needs1.pk} failed (RuntimeError)", err)
        self.assertNotIn("broker down", err)
        # the failed user kept the token issued for them -> next run just queues it
        self.assertEqual(EmailVerificationToken.objects.filter(user=self.needs1).count(), 1)
        self.delay.side_effect = None
        self.delay.reset_mock()
        result = run_json("repair_auth_data", "--resend-verification", "--apply")["tokens"]
        self.assertIn(self.needs1.pk, result["queued"])
        self.assertEqual(result["issued"], [])
        self.assertEqual(EmailVerificationToken.objects.filter(user=self.needs1).count(), 1)

    def test_never_touches_passwords_or_deletes_users(self):
        passwords = dict(User.objects.values_list("pk", "password"))
        run_command(
            "repair_auth_data", "--normalize-emails", "--issue-tokens", "--resend-verification",
            "--apply",
        )
        self.assertEqual(dict(User.objects.values_list("pk", "password")), passwords)

    def test_ensure_token_rechecks_eligibility_under_the_lock(self):
        from account.management.commands.repair_auth_data import Command

        self.assertEqual(Command._ensure_token(self.has_valid.pk), (False, None))  # emailed link exists
        self.assertEqual(Command._ensure_token(self.unsent.pk), (False, self.unsent_token.pk))
        self.assertEqual(Command._ensure_token(self.verified.pk), (False, None))
        self.assertEqual(Command._ensure_token(self.inactive.pk), (False, None))
        issued, token_id = Command._ensure_token(self.needs1.pk)
        self.assertTrue(issued)
        self.assertEqual(Command._ensure_token(self.needs1.pk), (False, token_id))  # reuses it


class EnsureEmailCiIndexTests(TransactionTestCase):
    """F12: unmanaged lower(email) unique index; DDL, so TransactionTestCase."""

    def setUp(self):
        self.drop_index()
        self.addCleanup(self.drop_index)  # never leak the index into other tests

    @staticmethod
    def drop_index():
        with connection.cursor() as cursor:
            cursor.execute(f'DROP INDEX IF EXISTS "{INDEX_NAME}"')

    @staticmethod
    def index_count():
        with connection.cursor() as cursor:
            if connection.vendor == "postgresql":
                cursor.execute("SELECT COUNT(*) FROM pg_indexes WHERE indexname=%s", [INDEX_NAME])
            else:
                cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=%s", [INDEX_NAME])
            return cursor.fetchone()[0]

    def test_refuses_when_case_insensitive_duplicates_exist(self):
        make_legacy("Dup@Example.com")
        make_legacy("dup@example.com")
        make_legacy("Other@Example.com")
        make_legacy("OTHER@example.com")
        for args in ((), ("--dry-run",)):
            with self.subTest(args=args):
                with self.assertRaises(CommandError) as ctx:
                    run_command("ensure_email_ci_index", *args)
                self.assertIn("2 case-insensitive duplicate email group(s)", str(ctx.exception))
                self.assertNotIn("example.com", str(ctx.exception))
                self.assertEqual(self.index_count(), 0)

    def test_dry_run_prints_sql_and_creates_nothing(self):
        make_user("someone@example.com")
        out, _ = run_command("ensure_email_ci_index", "--dry-run")
        self.assertIn("DRY RUN", out)
        concurrently = "CONCURRENTLY " if connection.vendor == "postgresql" else ""
        self.assertIn(f'CREATE UNIQUE INDEX {concurrently}IF NOT EXISTS "{INDEX_NAME}"', out)
        self.assertIn("(lower(\"email\")) WHERE \"email\" IS NOT NULL", out)
        self.assertEqual(self.index_count(), 0)

    def test_creates_the_index_once_and_is_idempotent(self):
        make_user("someone@example.com")
        first, _ = run_command("ensure_email_ci_index")
        self.assertIn("Created unique index", first)
        self.assertEqual(self.index_count(), 1)
        second, _ = run_command("ensure_email_ci_index")
        self.assertIn("already exists", second)
        self.assertEqual(self.index_count(), 1)

    def test_works_on_an_empty_table(self):
        out, _ = run_command("ensure_email_ci_index")
        self.assertIn("Created unique index", out)

    def test_enforces_case_insensitive_uniqueness_afterwards(self):
        make_user("first@example.com")
        run_command("ensure_email_ci_index")
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_legacy("FIRST@Example.com")  # exact-case index alone would allow this
        make_legacy(None)  # NULL emails stay unconstrained
        make_legacy(None)
        make_legacy("second@example.com")
        self.assertEqual(User.objects.filter(email__isnull=True).count(), 2)
        with self.assertRaises(ValueError):  # create_user still gives the friendly error
            make_user("First@Example.com")

    def test_model_state_is_untouched(self):
        # The index is unmanaged: nothing to migrate.
        self.assertEqual(list(CustomUser._meta.indexes), [])
        self.assertEqual(list(CustomUser._meta.constraints), [])
        self.assertTrue(CustomUser._meta.get_field("email").unique)

    def test_postgres_branch_builds_concurrent_sql_and_replaces_invalid_leftovers(self):
        from account.management.commands import ensure_email_ci_index as module

        with mock.patch.object(connection, "vendor", "postgresql"), mock.patch.object(
            module.Command, "_index_state", return_value="invalid"
        ):
            out, _ = run_command("ensure_email_ci_index", "--dry-run")
        self.assertIn("INVALID", out)
        self.assertIn(f'DROP INDEX CONCURRENTLY IF EXISTS "{INDEX_NAME}"', out)
        self.assertIn(f'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "{INDEX_NAME}"', out)
        with mock.patch.object(connection, "vendor", "postgresql"), mock.patch.object(
            module.Command, "_index_state", return_value=None
        ):
            out, _ = run_command("ensure_email_ci_index", "--dry-run")
        self.assertNotIn("DROP INDEX", out)
        with mock.patch.object(connection, "vendor", "postgresql"), mock.patch.object(
            connection, "in_atomic_block", True
        ):
            with self.assertRaises(CommandError) as ctx:  # CONCURRENTLY needs autocommit
                run_command("ensure_email_ci_index")
        self.assertIn("inside a transaction", str(ctx.exception))

    def test_unsupported_database_vendor_is_rejected(self):
        with mock.patch.object(connection, "vendor", "mysql"):
            with self.assertRaises(CommandError):
                run_command("ensure_email_ci_index", "--dry-run")


class AdminFormEmailConsistencyTests(TestCase):
    """Admin forms canonicalise email like the model/API, so clashes are form errors."""

    @staticmethod
    def add_data(email, **extra):
        return {
            "first_name": "Nadia", "surname": "Novak", "email": email, "password": "",
            "phone": "", "address_line": "", "address_line2": "", "city": "",
            "postal_code": "", "notes": "", **extra,
        }

    @staticmethod
    def change_data(user, email):
        return {
            "first_name": "Legacy", "surname": "Row", "email": email, "password": user.password,
            "is_email_verified": False, "phone": "", "address_line": "", "address_line2": "",
            "city": "", "postal_code": "", "notes": "", "bill_use_delivery_address": True,
        }

    def test_add_form_reports_case_variant_of_existing_email_as_a_form_error(self):
        from account.forms import CustomUserCreationForm

        make_user("taken@example.com")
        for raw in ("TAKEN@Example.com", "  Taken@example.com "):
            with self.subTest(raw=raw):
                form = CustomUserCreationForm(data=self.add_data(raw))
                self.assertFalse(form.is_valid())  # used to pass, then 500 in save_model
                self.assertIn("email", form.errors)

    def test_add_form_canonicalises_and_keeps_blank_as_null(self):
        from account.forms import CustomUserCreationForm

        form = CustomUserCreationForm(data=self.add_data("  New.Person@Example.COM "))
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["email"], "new.person@example.com")
        blank = CustomUserCreationForm(data=self.add_data(""))
        self.assertTrue(blank.is_valid(), blank.errors)
        self.assertIsNone(blank.cleaned_data["email"])

    def test_change_form_canonicalises_a_legacy_mixed_case_email(self):
        from account.forms import CustomUserForm

        legacy = make_legacy("Legacy.Row@Example.com")
        form = CustomUserForm(data=self.change_data(legacy, "Legacy.Row@Example.com"), instance=legacy)
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["email"], "legacy.row@example.com")
        form.save(commit=False).save()
        self.assertEqual(User.objects.get(pk=legacy.pk).email, "legacy.row@example.com")

    def test_change_form_rejects_email_owned_by_another_user(self):
        from account.forms import CustomUserForm

        make_user("owner@example.com")
        legacy = make_legacy("Other.Person@Example.com")
        form = CustomUserForm(data=self.change_data(legacy, "OWNER@example.com"), instance=legacy)
        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)
