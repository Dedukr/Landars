"""
Flag existing jerky products for the ``jerky_5_1`` promotion (idempotent, safe to re-run).

``Product.promo_group`` is admin-editable, so this command only exists to avoid
clicking through every jerky product once after the field is added.

Matching is deliberately **substring only** (``name__icontains``) and scoped to a
category: product names in this catalogue are not clean (at least one jerky name
contains a double space), so exact-name matching silently misses rows.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Product, ProductCategory
from api.services.promotions import JERKY_5_1, PROMO_DEFINITIONS

DEFAULT_CATEGORY_NAME = "Meat Snacks"
DEFAULT_NAME_CONTAINS = "jerky"


class Command(BaseCommand):
    help = (
        "Set Product.promo_group on jerky products (substring match within a category) "
        "so the Jerky 5+1 promotion applies without editing each product by hand."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--category",
            default=DEFAULT_CATEGORY_NAME,
            help=(
                "Category name the products must be tagged with "
                f"(default: {DEFAULT_CATEGORY_NAME!r})."
            ),
        )
        parser.add_argument(
            "--category-id",
            type=int,
            default=None,
            help="Category id, used instead of --category when given.",
        )
        parser.add_argument(
            "--name-contains",
            default=DEFAULT_NAME_CONTAINS,
            help=(
                "Case-insensitive substring the product name must contain "
                f"(default: {DEFAULT_NAME_CONTAINS!r})."
            ),
        )
        parser.add_argument(
            "--promo-group",
            default=JERKY_5_1.group,
            choices=sorted(PROMO_DEFINITIONS),
            help=f"Promotion to assign (default: {JERKY_5_1.group!r}).",
        )
        parser.add_argument(
            "--active-only",
            action="store_true",
            help="Skip inactive products (by default they are flagged too).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def _resolve_category(self, category_id: int | None, name: str) -> ProductCategory:
        if category_id is not None:
            category = ProductCategory.objects.filter(pk=category_id).first()
            if category is None:
                raise CommandError(f"No ProductCategory with id={category_id}.")
            return category

        matches = list(ProductCategory.objects.filter(name__iexact=name.strip()))
        if not matches:
            raise CommandError(
                f"No ProductCategory named {name!r}. Pass --category-id instead."
            )
        if len(matches) > 1:
            ids = ", ".join(str(c.id) for c in matches)
            raise CommandError(
                f"{len(matches)} categories are named {name!r} (ids: {ids}). "
                "Pass --category-id to disambiguate."
            )
        return matches[0]

    @transaction.atomic
    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style

        promo_group = options["promo_group"]
        needle = (options["name_contains"] or "").strip()
        if not needle:
            raise CommandError("--name-contains cannot be empty.")

        category = self._resolve_category(options["category_id"], options["category"])
        definition = PROMO_DEFINITIONS[promo_group]

        products = Product.objects.filter(
            categories=category,
            name__icontains=needle,
        )
        if options["active_only"]:
            products = products.filter(active=True)
        products = products.order_by("id")

        candidates = list(products)
        if not candidates:
            w(
                style.WARNING(
                    f"No product in category {category.name!r} (id={category.id}) has "
                    f"{needle!r} in its name. Nothing to do."
                )
            )
            return

        to_update = [p for p in candidates if p.promo_group != promo_group]
        already = len(candidates) - len(to_update)

        w(
            f"Category {category.name!r} (id={category.id}) — {len(candidates)} product(s) "
            f"matching {needle!r}:"
        )
        for product in candidates:
            marker = "=" if product.promo_group == promo_group else "+"
            flags = "" if product.active else "  [inactive]"
            w(f"  {marker} {product.name!r} (id={product.id}){flags}")

        if options["dry_run"]:
            w("")
            w(
                style.WARNING(
                    f"Dry run: would set promo_group={promo_group!r} on "
                    f"{len(to_update)} product(s); {already} already flagged."
                )
            )
            transaction.set_rollback(True)
            return

        updated = 0
        if to_update:
            updated = Product.objects.filter(
                pk__in=[p.pk for p in to_update]
            ).update(promo_group=promo_group)

        w("")
        w(
            style.SUCCESS(
                f"Flagged {updated} product(s) for {definition.label} "
                f"(promo_group={promo_group!r}); {already} were already flagged."
            )
        )
        w(
            style.WARNING(
                "Products keep this flag until an admin clears it — review the list "
                "above and unflag anything that should not be part of the promotion."
            )
        )
