"""
Validation command for the ProductCategory parent -> CategoryGroup redesign.

Run this after ``migrate_parent_categories_to_groups`` and
``strip_parent_categories_from_products`` (while the ``parent`` column still exists) to
assert the data is in a safe state before dropping the schema field. Exits with a non-zero
status if any assertion fails, so it can be re-run until clean.

Asserts:
  1. No product is tagged with a category that still has children (no parent tags remain
     on products, except any explicitly-flagged zero-category fallback case).
  2. Every former-parent category (has children) is represented in some CategoryGroup
     (i.e. all of its children are members of at least one group, ideally the same one).
  3. Every CategoryGroup's M2M membership contains only categories with zero children
     (leaf categories only).
  4. Total product-category tag counts for leaf categories match a given baseline (pass
     ``--baseline-total=<int>`` captured from the audit command's
     "Total leaf-category product tags" line to compare; skipped if not provided).
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from api.models import CategoryGroup, Product, ProductCategory


class Command(BaseCommand):
    help = "Validate category/group data integrity before/after the parent -> CategoryGroup migration."

    def add_arguments(self, parser):
        parser.add_argument(
            "--baseline-total",
            type=int,
            default=None,
            help="Expected total leaf-category product tag count from the audit command, to diff against.",
        )
        parser.add_argument(
            "--allow-parent-tags-on",
            type=str,
            default="",
            help="Comma-separated product ids allowed to still carry a parent-category tag "
            "(the zero-category fallback cases flagged by strip_parent_categories_from_products).",
        )

    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style
        failures: list[str] = []

        allowed_ids = {
            int(x) for x in (options["allow_parent_tags_on"] or "").split(",") if x.strip()
        }

        all_categories = list(ProductCategory.objects.all())
        parents = [c for c in all_categories if c.subcategories.exists()]
        parent_ids = {c.id for c in parents}
        leaf_ids = {c.id for c in all_categories if c.id not in parent_ids}

        # 1. No product tagged with a parent category (except allowed fallback ids).
        w(style.MIGRATE_HEADING("[1/4] Checking no product carries a parent-category tag..."))
        bad_products = (
            Product.objects.filter(categories__id__in=parent_ids)
            .exclude(id__in=allowed_ids)
            .distinct()
        )
        count = bad_products.count()
        if count:
            failures.append(
                f"{count} product(s) still tagged with a parent category: "
                + ", ".join(f"{p.name!r} (id={p.id})" for p in bad_products[:20])
            )
        else:
            w(style.SUCCESS("  OK — no product carries a parent-category tag."))

        # 2. Every former-parent category is represented in some CategoryGroup via its children.
        w(style.MIGRATE_HEADING("[2/4] Checking every parent's children are covered by a CategoryGroup..."))
        for parent in parents:
            children = set(parent.subcategories.values_list("id", flat=True))
            if not children:
                continue
            covered = set(
                CategoryGroup.objects.filter(categories__id__in=children)
                .values_list("categories__id", flat=True)
            )
            missing = children - covered
            if missing:
                missing_names = ProductCategory.objects.filter(id__in=missing).values_list(
                    "name", flat=True
                )
                failures.append(
                    f"Parent {parent.name!r} (id={parent.id}) has children not in any "
                    f"CategoryGroup: {list(missing_names)}"
                )
        if not any("has children not in any CategoryGroup" in f for f in failures):
            w(style.SUCCESS("  OK — every parent's children are covered by a CategoryGroup."))

        # 3. Every CategoryGroup contains only leaf categories.
        w(style.MIGRATE_HEADING("[3/4] Checking every CategoryGroup contains only leaf categories..."))
        bad_group_members = []
        for group in CategoryGroup.objects.prefetch_related("categories"):
            for cat in group.categories.all():
                if cat.id in parent_ids:
                    bad_group_members.append((group, cat))
        if bad_group_members:
            for group, cat in bad_group_members:
                failures.append(
                    f"CategoryGroup {group.name!r} (id={group.id}) contains structural parent "
                    f"{cat.name!r} (id={cat.id}) — should only contain leaves."
                )
        else:
            w(style.SUCCESS("  OK — every CategoryGroup contains only leaf categories."))

        # 4. Leaf-category product tag totals match baseline (if provided).
        w(style.MIGRATE_HEADING("[4/4] Checking leaf-category product tag totals..."))
        total_leaf_tags = (
            ProductCategory.objects.filter(id__in=leaf_ids)
            .annotate(n=Count("products", distinct=True))
            .values_list("n", flat=True)
        )
        current_total = sum(total_leaf_tags)
        baseline = options.get("baseline_total")
        if baseline is None:
            w(style.WARNING(f"  Skipped (no --baseline-total given). Current total: {current_total}"))
        elif current_total != baseline:
            failures.append(
                f"Leaf-category product tag total changed: baseline={baseline}, current={current_total}"
            )
        else:
            w(style.SUCCESS(f"  OK — leaf-category product tag total unchanged ({current_total})."))

        w("")
        if failures:
            w(style.ERROR(f"VALIDATION FAILED — {len(failures)} issue(s):"))
            for f in failures:
                w(style.ERROR(f"  - {f}"))
            raise CommandError("Validation failed. See issues above.")

        w(style.SUCCESS("VALIDATION PASSED — safe to proceed."))
