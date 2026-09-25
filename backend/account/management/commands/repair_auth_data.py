"""
Repair legacy / partial authentication data. DRY-RUN BY DEFAULT.

    manage.py repair_auth_data --normalize-emails                # show what would change
    manage.py repair_auth_data --normalize-emails --apply        # write
    manage.py repair_auth_data --issue-tokens --apply            # fresh tokens, no email sent
    manage.py repair_auth_data --resend-verification --apply     # queue verification emails

Safety: never touches passwords, never deletes or merges users, never overwrites
an email that another row already holds in canonical form (reported as a
conflict for a human to resolve). Each row is handled on its own so one failure
does not abort the batch. Output contains counts and user ids only (no emails).
"""

import json
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from account.email_normalization import normalize_email
from account.management.commands.check_auth_data import users_without_valid_token
from account.models import CustomUser, EmailVerificationToken

REPAIR_USER_AGENT = "repair_auth_data"
SHOW_IDS = 20  # cap for ids printed in the human-readable summary (JSON has all)


class Command(BaseCommand):
    help = (
        "Repair legacy auth data (dry-run unless --apply): canonicalise emails, issue "
        "verification tokens, queue verification emails. Never touches passwords or "
        "deletes/merges users."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Write changes (default: dry-run).")
        parser.add_argument(
            "--normalize-emails",
            action="store_true",
            help="Set the canonical email where no other row already has that form; "
            "clashes are reported as conflicts and left untouched.",
        )
        parser.add_argument(
            "--issue-tokens",
            action="store_true",
            help="Create one fresh valid verification token for unverified active website "
            "users lacking a valid one (no email is sent).",
        )
        parser.add_argument(
            "--resend-verification",
            action="store_true",
            help="Queue send_verification_email_task for unverified active website users who "
            "have no emailed valid token (a token is issued first when none is valid).",
        )
        parser.add_argument(
            "--limit", type=int, default=50, help="Max users for token/resend actions (default 50)."
        )
        parser.add_argument(
            "--min-age-minutes",
            type=int,
            default=10,
            help="Only users created at least this long ago (default 10).",
        )
        parser.add_argument(
            "--max-age-days",
            type=int,
            default=14,
            help="Only users created at most this long ago (default 14).",
        )
        parser.add_argument("--json", action="store_true", help="Emit the summary as JSON.")

    def handle(self, *args, **options):
        apply = options["apply"]
        normalize = options["normalize_emails"]
        resend = options["resend_verification"]
        issue = options["issue_tokens"] or resend  # a resend needs a valid token
        if not (normalize or issue):
            raise CommandError(
                "Select at least one action: --normalize-emails, --issue-tokens, "
                "--resend-verification (add --apply to write; default is dry-run)."
            )
        if options["limit"] < 1 or options["min_age_minutes"] < 0 or options["max_age_days"] < 1:
            raise CommandError("--limit and --max-age-days must be >= 1, --min-age-minutes >= 0")

        summary = {"mode": "apply" if apply else "dry-run"}
        if normalize:
            summary["normalize_emails"] = self._normalize_emails(apply)
        if issue:
            summary["tokens"] = self._tokens_and_resend(
                apply,
                resend=resend,
                limit=options["limit"],
                min_age=timedelta(minutes=options["min_age_minutes"]),
                max_age=timedelta(days=options["max_age_days"]),
            )

        if options["json"]:
            self.stdout.write(json.dumps(summary, indent=2))
        else:
            self._print_summary(summary)

    # ------------------------------------------------------- normalize emails

    def _normalize_emails(self, apply):
        by_canonical = defaultdict(list)
        rows = (
            CustomUser.objects.exclude(email__isnull=True)
            .order_by("pk")
            .values_list("pk", "email")
        )
        for pk, email in rows.iterator(chunk_size=2000):
            canonical = normalize_email(email)
            if canonical:
                by_canonical[canonical].append((pk, email))

        fixable, conflicts = [], []
        for canonical, members in by_canonical.items():
            if all(email == canonical for _, email in members):
                continue
            if len(members) == 1:
                fixable.append((members[0][0], members[0][1], canonical))
            else:
                # Another row already is (or would become) this canonical form:
                # which account survives is a human decision - never guess.
                conflicts.append([pk for pk, _ in members])

        done, skipped, failed = [], [], []
        if apply:
            for pk, old, canonical in fixable:
                try:
                    with transaction.atomic():
                        # ``email=old`` guard: skip if the row changed since planning.
                        updated = CustomUser.objects.filter(pk=pk, email=old).update(email=canonical)
                except IntegrityError:
                    conflicts.append([pk])
                    continue
                except Exception as exc:
                    self.stderr.write(f"normalize_emails: user {pk} failed ({type(exc).__name__})")
                    failed.append(pk)
                    continue
                (done if updated else skipped).append(pk)
        result = {"candidates": len(fixable)}
        result["updated" if apply else "would_update"] = (
            done if apply else [pk for pk, _, _ in fixable]
        )
        result.update(conflict_groups=sorted(conflicts), skipped_changed=skipped, failed=failed)
        return result

    # ------------------------------------------------ verification tokens/mail

    def _select_targets(self, now, *, resend, limit, min_age, max_age):
        no_token = users_without_valid_token(now, min_age=min_age, max_age=max_age)
        targets = [(pk, "no_token") for pk in no_token.order_by("pk").values_list("pk", flat=True)[:limit]]
        eligible = {"no_valid_token": no_token.count()}
        if resend:
            valid = EmailVerificationToken.objects.filter(
                user=OuterRef("pk"), is_used=False, expires_at__gt=now
            )
            unsent_only = (
                CustomUser.objects.filter(
                    is_email_verified=False,
                    is_active=True,
                    created_source=CustomUser.CREATED_SOURCE_WEBSITE,
                    created_at__lt=now - min_age,
                    created_at__gte=now - max_age,
                )
                .filter(Exists(valid.filter(email_sent_at__isnull=True)))
                .filter(~Exists(valid.filter(email_sent_at__isnull=False)))
            )
            eligible["valid_token_never_emailed"] = unsent_only.count()
            room = limit - len(targets)
            if room > 0:
                ids = unsent_only.order_by("pk").values_list("pk", flat=True)[:room]
                targets += [(pk, "unsent_token") for pk in ids]
        return targets, eligible

    def _tokens_and_resend(self, apply, *, resend, limit, min_age, max_age):
        targets, eligible = self._select_targets(
            timezone.now(), resend=resend, limit=limit, min_age=min_age, max_age=max_age
        )
        issued, queued, skipped, failed = [], [], [], []
        for pk, kind in targets:
            if not apply:
                if kind == "no_token":
                    issued.append(pk)
                if resend:
                    queued.append(pk)
                continue
            try:
                was_issued, token_id = self._ensure_token(pk)
                if was_issued:
                    issued.append(pk)
                if resend and token_id is not None:
                    self._queue_email(token_id)
                    queued.append(pk)
                elif not was_issued:
                    skipped.append(pk)
            except Exception as exc:  # broker down, DB hiccup...: keep going
                self.stderr.write(f"tokens: user {pk} failed ({type(exc).__name__})")
                failed.append(pk)
        result = {
            "eligible": eligible,
            "limit": limit,
            "selected": len(targets),
            "skipped_no_longer_eligible": skipped,
            "failed": failed,
        }
        result["issued" if apply else "would_issue"] = issued
        if resend:
            result["queued" if apply else "would_queue"] = queued
        return result

    @staticmethod
    def _ensure_token(user_id):
        """Return ``(issued, token_id)``; ``token_id`` is None when nothing is to be sent.

        The user row is locked so two concurrent runs cannot both issue a token,
        and eligibility is re-checked under the lock.
        """
        with transaction.atomic():
            user = CustomUser.objects.select_for_update().get(pk=user_id)
            if user.is_email_verified or not user.is_active:
                return False, None
            token = (
                EmailVerificationToken.objects.filter(
                    user=user, is_used=False, expires_at__gt=timezone.now()
                )
                .order_by("-created_at")
                .first()
            )
            if token is None:
                token = EmailVerificationToken.objects.create(
                    user=user, user_agent=REPAIR_USER_AGENT
                )
                return True, token.pk
            if token.email_sent_at is not None:
                return False, None  # someone else already emailed a valid link
            return False, token.pk

    @staticmethod
    def _queue_email(token_id):
        from account.tasks import send_verification_email_task  # lazy: needs Celery app

        send_verification_email_task.delay(token_id)

    # ----------------------------------------------------------------- output

    def _print_summary(self, summary):
        apply = summary["mode"] == "apply"
        self.stdout.write(
            self.style.SUCCESS("Auth data repair - APPLY")
            if apply
            else self.style.WARNING("Auth data repair - DRY RUN (nothing written; add --apply)")
        )

        def ids(values):
            shown = ", ".join(str(v) for v in values[:SHOW_IDS])
            more = f" ... +{len(values) - SHOW_IDS} more" if len(values) > SHOW_IDS else ""
            return f"[{shown}{more}]"

        if "normalize_emails" in summary:
            data = summary["normalize_emails"]
            key = "updated" if apply else "would_update"
            self.stdout.write(f"normalize_emails: {len(data[key])} {key.replace('_', ' ')} of {data['candidates']} candidate(s) {ids(data[key])}")
            if data["conflict_groups"]:
                self.stdout.write(self.style.WARNING(
                    f"  conflicts left untouched: {len(data['conflict_groups'])} group(s) {ids(data['conflict_groups'])}"
                ))
            for name in ("skipped_changed", "failed"):
                if data[name]:
                    self.stdout.write(f"  {name}: {ids(data[name])}")
        if "tokens" in summary:
            data = summary["tokens"]
            self.stdout.write(
                f"tokens: selected {data['selected']} user(s) (limit {data['limit']}); eligible {data['eligible']}"
            )
            for key in ("issued", "would_issue", "queued", "would_queue", "skipped_no_longer_eligible", "failed"):
                if key in data and (data[key] or key in ("issued", "would_issue", "queued", "would_queue")):
                    self.stdout.write(f"  {key.replace('_', ' ')}: {len(data[key])} {ids(data[key])}")
