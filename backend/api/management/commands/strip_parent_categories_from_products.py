"""
Phase B, step 2 (idempotent, safe to re-run) of the ProductCategory parent -> CategoryGroup
redesign.

Removes any structural parent category (a ProductCategory with children) from every
``Product.categories`` M2M — products should only ever end up tagged with leaf categories,
since navigation/grouping now happens via ``CategoryGroup`` membership instead.

Safety: if removing a parent tag would leave a product with ZERO categories, that removal
is skipped for that product (the parent tag is kept) and the product is logged loudly in
the final report instead of being silently dropped to zero categories. Run the audit
command afterwards to confirm no product actually needs this fallback in your data.

Run ``migrate_parent_categories_to_groups`` BEFORE this command so every parent's children
are already reachable via a CategoryGroup before their direct-tag shortcut is removed.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import Product, ProductCategory


class Command(BaseCommand):
    help = (
        "Remove structural parent categories from Product.categories M2M so products only "
        "carry leaf category tags. Never leaves a product with zero categories — flags and "
        "skips instead."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style

        parent_ids = [
            c.id for c in ProductCategory.objects.all() if c.subcategories.exists()
        ]

        if not parent_ids:
            w(style.WARNING("No structural parent categories found. Nothing to do."))
            return

        products = (
            Product.objects.filter(categories__id__in=parent_ids)
            .distinct()
            .prefetch_related("categories")
        )

        stripped_count = 0
        skipped_would_be_zero: list[tuple[int, str]] = []

        for product in products:
            current_ids = set(product.categories.values_list("id", flat=True))
            to_remove = current_ids & set(parent_ids)
            if not to_remove:
                continue
            remaining = current_ids - to_remove
            if not remaining:
                skipped_would_be_zero.append((product.id, product.name))
                w(
                    style.ERROR(
                        f"  SKIPPED product {product.name!r} (id={product.id}): removing its "
                        f"parent categor{'y' if len(to_remove) == 1 else 'ies'} "
                        f"({sorted(to_remove)}) would leave it with ZERO categories. Keeping "
                        f"the parent tag assigned for now — needs manual review."
                    )
                )
                continue
            product.categories.remove(*to_remove)
            stripped_count += 1

        w("")
        w(
            style.SUCCESS(
                f"Stripped parent-category tags from {stripped_count} product(s)."
            )
        )
        if skipped_would_be_zero:
            w(
                style.ERROR(
                    f"{len(skipped_would_be_zero)} product(s) were left with their parent tag "
                    f"intact because removing it would have zeroed out their categories:"
                )
            )
            for pid, name in skipped_would_be_zero:
                w(style.ERROR(f"    - {name!r} (id={pid})"))
            w(
                style.WARNING(
                    "Review these manually: tag them with an appropriate leaf category, then "
                    "re-run this command."
                )
            )
        else:
            w(style.SUCCESS("No product was left at risk of zero categories."))
