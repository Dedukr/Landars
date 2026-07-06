"""
Final cleanup step of the ProductCategory parent -> CategoryGroup redesign.

Run this ONLY after:
  1. ``migrate_parent_categories_to_groups`` has created a CategoryGroup per former parent.
  2. ``strip_parent_categories_from_products`` has removed parent tags from every product.
  3. ``validate_category_group_migration`` has passed.
  4. The ``parent`` field has been dropped from ``ProductCategory`` (schema migration applied).

At this point, a former structural parent category is now just an ordinary (flat) row with
no ``parent``/``subcategories`` concept left in the schema. We identify former parents
conservatively as: a ProductCategory whose name exactly matches an existing CategoryGroup's
name, which currently has ZERO directly-tagged products, and which is NOT itself a member of
any CategoryGroup (i.e. it's not being used as a leaf category by mistake).

Triple safety checks before deleting each row:
  - Zero products reference it directly (``category.products.count() == 0``).
  - It is not a member of any CategoryGroup.
  - A CategoryGroup with the exact same name exists (i.e. its role has been preserved).

Anything that doesn't unambiguously satisfy all three conditions is left alone and reported
instead of guessed at.

Use ``--dry-run`` to preview without deleting.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from api.models import CategoryGroup, ProductCategory


class Command(BaseCommand):
    help = (
        "Delete ProductCategory rows that were purely structural former parents, now fully "
        "represented by an identically-named CategoryGroup and with zero directly-tagged "
        "products. Safe/conservative — anything ambiguous is left alone and reported."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview candidates without deleting anything.",
        )

    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style
        dry_run = options["dry_run"]

        group_names = set(CategoryGroup.objects.values_list("name", flat=True))
        member_ids = set(
            CategoryGroup.categories.through.objects.values_list(
                "productcategory_id", flat=True
            )
        )

        candidates = []
        for cat in ProductCategory.objects.all().order_by("name"):
            if cat.name not in group_names:
                continue
            if cat.id in member_ids:
                continue
            if cat.products.count() != 0:
                continue
            candidates.append(cat)

        if not candidates:
            w(style.WARNING("No orphaned former-parent categories found. Nothing to delete."))
            return

        w(style.MIGRATE_HEADING(f"Found {len(candidates)} candidate(s) for deletion:"))
        for cat in candidates:
            group = CategoryGroup.objects.filter(name=cat.name).first()
            w(
                f"  {cat.name!r} (id={cat.id}) — 0 products, matches CategoryGroup "
                f"{group.name!r} (id={group.id}) with {group.categories.count()} members"
            )

        if dry_run:
            w(style.WARNING("Dry run — no rows deleted. Re-run without --dry-run to delete."))
            return

        ids = [c.id for c in candidates]
        deleted_count, _ = ProductCategory.objects.filter(id__in=ids).delete()
        w(style.SUCCESS(f"Deleted {len(candidates)} orphaned former-parent ProductCategory row(s)."))
