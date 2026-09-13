"""
Interactively find users with similar names and optionally merge them.

Uses the same similarity rules as ``account.merge_service`` (normalize +
SequenceMatcher threshold). For each candidate pair, prints identity, profile
address, billing addresses, and orders, then asks whether to merge.

Examples::

    python manage.py review_similar_users
    python manage.py review_similar_users --threshold 0.95
    python manage.py review_similar_users --dry-run --limit 20
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from account.merge_service import (
    SIMILARITY_THRESHOLD,
    _attempt_merge,
    name_similarity,
    names_are_similar,
    normalize_name,
    select_canonical_user,
)

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Scan users for similar names, show address/orders for each match, "
        "and interactively confirm merges."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--threshold",
            type=float,
            default=SIMILARITY_THRESHOLD,
            help=(
                f"Minimum name similarity ratio to treat as a match "
                f"(default: {SIMILARITY_THRESHOLD})"
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Max number of pairs to review (0 = all)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List matches only; never merge",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="Include inactive users in the scan (default: active only)",
        )

    def handle(self, *args, **options):
        threshold = options["threshold"]
        limit = options["limit"]
        dry_run = options["dry_run"]
        include_inactive = options["include_inactive"]

        if threshold <= 0 or threshold > 1:
            self.stderr.write(self.style.ERROR("--threshold must be in (0, 1]"))
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN — matches will be listed, no merges")
            )

        users = self._load_users(include_inactive=include_inactive)
        self.stdout.write(f"Scanning {len(users)} users (threshold={threshold:.2f})…")

        pairs = self._find_pairs(users, threshold=threshold)
        if not pairs:
            self.stdout.write(self.style.SUCCESS("No similar-name pairs found."))
            return

        if limit > 0:
            pairs = pairs[:limit]

        self.stdout.write(
            self.style.NOTICE(f"Found {len(pairs)} pair(s) to review.\n")
        )

        merged = 0
        skipped = 0
        # Users removed/deactivated mid-run — skip later pairs that reference them
        gone_pks: set[int] = set()

        for index, (user_a, user_b, ratio) in enumerate(pairs, start=1):
            if user_a.pk in gone_pks or user_b.pk in gone_pks:
                skipped += 1
                continue

            # Refresh in case a prior merge changed fields
            try:
                user_a.refresh_from_db()
                user_b.refresh_from_db()
            except User.DoesNotExist:
                gone_pks.update({user_a.pk, user_b.pk})
                skipped += 1
                continue

            self.stdout.write("=" * 72)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Match {index}/{len(pairs)} — similarity {ratio:.3f}"
                )
            )
            self._print_user_block("A", user_a)
            self.stdout.write("-" * 40)
            self._print_user_block("B", user_b)

            main, dup = select_canonical_user(user_a, user_b)
            if main is None:
                self.stdout.write(
                    self.style.WARNING(
                        "\nAuto-merge would SKIP this pair (different emails). "
                        "Manual merge is still available if you confirm."
                    )
                )
                self.stdout.write(
                    f"  A email={user_a.email!r}  |  B email={user_b.email!r}"
                )
            else:
                self.stdout.write(
                    self.style.NOTICE(
                        f"\nIf merged with current rules → KEEP pk={main.pk} "
                        f"({main.get_display_name() or main.name!r}), "
                        f"REMOVE pk={dup.pk} ({dup.get_display_name() or dup.name!r})"
                    )
                )

            if dry_run:
                skipped += 1
                self.stdout.write("")
                continue

            choice = self._ask_action()
            if choice == "q":
                self.stdout.write(self.style.WARNING("Stopped by user."))
                break
            if choice == "n":
                skipped += 1
                self.stdout.write("Skipped.\n")
                continue

            # choice == "y"
            main, dup = select_canonical_user(user_a, user_b)
            try:
                if main is None:
                    keep_pk = self._ask_keep_pk(user_a, user_b)
                    if keep_pk is None:
                        skipped += 1
                        self.stdout.write("Skipped.\n")
                        continue
                    main = user_a if user_a.pk == keep_pk else user_b
                    dup = user_b if main.pk == user_a.pk else user_a
                    self.stdout.write(
                        self.style.WARNING(
                            "Different emails: merging with your chosen keeper. "
                            "The duplicate's email will be replaced before removal."
                        )
                    )
                    self._force_merge(main, dup)
                else:
                    _attempt_merge(user_a, user_b)
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"Merge failed: {exc}"))
                skipped += 1
                continue

            gone_pks.add(dup.pk)
            merged += 1
            self.stdout.write(self.style.SUCCESS("Merged.\n"))

        self.stdout.write("=" * 72)
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. merged={merged} skipped/listed={skipped} "
                f"pairs_considered={len(pairs)}"
            )
        )

    def _load_users(self, *, include_inactive: bool):
        qs = User.objects.all().order_by("pk")
        if not include_inactive:
            qs = qs.filter(is_active=True)

        return list(
            qs.select_related(
                "profile",
                "profile__address",
                "profile__billing_address",
            ).prefetch_related("billing_addresses")
        )

    def _find_pairs(self, users, *, threshold: float):
        """Return list of (user_a, user_b, ratio) sorted by ratio descending."""
        # Override module threshold for this run when custom --threshold is used
        pairs = []
        named = []
        for user in users:
            label = normalize_name(user.name or "")
            if not label:
                continue
            named.append(user)

        for i, left in enumerate(named):
            left_name = left.name or ""
            for right in named[i + 1 :]:
                right_name = right.name or ""
                if threshold == SIMILARITY_THRESHOLD:
                    if not names_are_similar(left_name, right_name):
                        continue
                    ratio = name_similarity(left_name, right_name)
                else:
                    ratio = name_similarity(left_name, right_name)
                    if ratio < threshold and normalize_name(left_name) != normalize_name(
                        right_name
                    ):
                        continue
                    if normalize_name(left_name) == normalize_name(right_name):
                        ratio = max(ratio, 1.0)
                    if ratio < threshold:
                        continue
                pairs.append((left, right, ratio))

        pairs.sort(key=lambda item: item[2], reverse=True)
        return pairs

    def _print_user_block(self, label: str, user):
        display = user.get_display_name() or user.name or "(no name)"
        self.stdout.write(f"[{label}] pk={user.pk}  name={display!r}")
        self.stdout.write(
            f"     email={user.email!r}  source={user.created_source}  "
            f"active={user.is_active}  email_verified={user.is_email_verified}"
        )
        self.stdout.write(
            f"     first_name={user.first_name!r}  surname={user.surname!r}  "
            f"created_at={user.created_at}"
        )

        profile = getattr(user, "profile", None)
        if profile is None:
            self.stdout.write("     profile: (none)")
        else:
            self.stdout.write(
                f"     phone={profile.phone!r}  notes={(profile.notes or '')[:80]!r}"
            )
            addr = profile.address
            if addr:
                self.stdout.write(
                    "     delivery address: "
                    f"{addr.address_line or ''} {addr.address_line2 or ''} "
                    f"{addr.city or ''} {addr.postal_code or ''}".strip()
                )
            else:
                self.stdout.write("     delivery address: (none)")
            bill = profile.billing_address
            if bill:
                self.stdout.write(
                    "     profile billing: "
                    f"{bill.company_name or bill.contact_name or ''} "
                    f"{bill.address_line or ''} {bill.city or ''} "
                    f"{bill.postal_code or ''}".strip()
                )

        billing_list = list(user.billing_addresses.all()[:5])
        if billing_list:
            self.stdout.write(f"     billing addresses ({len(billing_list)} shown):")
            for ba in billing_list:
                self.stdout.write(
                    f"       - #{ba.pk} {ba.company_name or ba.contact_name or ''} "
                    f"| {ba.address_line or ''} {ba.city or ''} {ba.postal_code or ''}"
                )

        orders = list(user.orders.order_by("-created_at")[:20])
        if not orders:
            self.stdout.write("     orders: (none)")
            return

        total = user.orders.count()
        self.stdout.write(f"     orders ({min(len(orders), total)} of {total}):")
        for order in orders:
            self.stdout.write(
                f"       - #{order.pk} status={order.status} source={order.source} "
                f"created={order.created_at.date() if order.created_at else '?'} "
                f"delivery={order.delivery_date or '-'} "
                f"fee={order.delivery_fee}"
            )

    def _ask_action(self) -> str:
        while True:
            try:
                raw = input("\nMerge these users? [y]es / [n]o / [q]uit: ").strip().lower()
            except EOFError:
                return "q"
            if raw in {"y", "yes"}:
                return "y"
            if raw in {"n", "no", ""}:
                return "n"
            if raw in {"q", "quit"}:
                return "q"
            self.stdout.write("Please enter y, n, or q.")

    def _ask_keep_pk(self, user_a, user_b) -> int | None:
        while True:
            try:
                raw = input(
                    f"Which pk to KEEP? [{user_a.pk}] / [{user_b.pk}] / [s]kip: "
                ).strip().lower()
            except EOFError:
                return None
            if raw in {"s", "skip", ""}:
                return None
            if raw == str(user_a.pk):
                return user_a.pk
            if raw == str(user_b.pk):
                return user_b.pk
            self.stdout.write(f"Enter {user_a.pk}, {user_b.pk}, or s.")

    def _force_merge(self, main_user, dup_user):
        """
        Merge when emails differ (user explicitly chose keeper).

        Clears duplicate email first so unique constraint / select rules do not
        block reassignment, then runs the standard merge helpers.
        """
        from django.db import transaction

        from account.merge_service import (
            _delete_or_deactivate_duplicate,
            _merge_profiles,
            _merge_user_fields,
            _reassign_all_related,
        )

        with transaction.atomic():
            if dup_user.email and main_user.email and dup_user.email != main_user.email:
                # Free the unique email on the duplicate before delete/deactivate
                User.objects.filter(pk=dup_user.pk).update(
                    email=f"merged-away+{dup_user.pk}@invalid.local"
                )
                dup_user.refresh_from_db(fields=["email"])

            _merge_user_fields(main_user, dup_user)
            _merge_profiles(main_user, dup_user)
            _reassign_all_related(main_user, dup_user)
            _delete_or_deactivate_duplicate(dup_user)
