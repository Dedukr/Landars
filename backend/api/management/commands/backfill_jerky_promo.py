"""
Ensure the Jerky leaf ProductCategory exists and tag matching products into it.

Eligibility is **ProductCategory membership** (``product.categories`` contains the
Jerky leaf), not ``Product.promo_group`` and not CategoryGroup. This command
creates / wires that leaf and optionally tags jerky products onto it. It never
writes ``Product.promo_group``.

Typical first-time setup on a catalogue where jerky currently lives under
``Meat Snacks`` (which also contains non-jerky items):

  python manage.py backfill_jerky_promo --create \\
      --tag-from-category "Meat Snacks" --name-contains jerky

Then optionally set ``JERKY_PROMO_CATEGORY_ID`` to the printed category id
(name lookup via ``JERKY_PROMO_CATEGORY_NAME=Jerky`` works without it).

Safe to re-run; ``--dry-run`` / ``--list`` never write.
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Product, ProductCategory
from api.services.jerky_promo_categories import (
    get_jerky_promo_category,
    get_jerky_promo_category_ids,
    jerky_promo_category_name,
)
from api.services.promotions import JERKY_5_1

DEFAULT_SOURCE_CATEGORY_NAME = "Meat Snacks"
DEFAULT_NAME_CONTAINS = "jerky"


class Command(BaseCommand):
    help = (
        "Create/ensure the Jerky leaf ProductCategory used for Jerky 5+1, "
        "optionally tag matching products into it, and list eligible products."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--create",
            action="store_true",
            help=(
                "Create the Jerky ProductCategory when missing "
                f"(name from settings, default {jerky_promo_category_name()!r})."
            ),
        )
        parser.add_argument(
            "--tag-from-category",
            default=None,
            metavar="NAME",
            help=(
                "Add matching products from this source category onto the Jerky "
                f"leaf (common value: {DEFAULT_SOURCE_CATEGORY_NAME!r}). "
                "Requires the Jerky category to exist (pass --create if needed)."
            ),
        )
        parser.add_argument(
            "--tag-from-category-id",
            type=int,
            default=None,
            help="Source category id instead of --tag-from-category.",
        )
        parser.add_argument(
            "--name-contains",
            default=DEFAULT_NAME_CONTAINS,
            help=(
                "Case-insensitive substring for --tag-from-category matching "
                f"(default: {DEFAULT_NAME_CONTAINS!r})."
            ),
        )
        parser.add_argument(
            "--active-only",
            action="store_true",
            help="When tagging, skip inactive products.",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="List products currently eligible for Jerky 5+1 and exit.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def _resolve_source_category(
        self, category_id: int | None, name: str | None
    ) -> ProductCategory:
        if category_id is not None:
            category = ProductCategory.objects.filter(pk=category_id).first()
            if category is None:
                raise CommandError(f"No ProductCategory with id={category_id}.")
            return category
        if not name:
            raise CommandError(
                "Pass --tag-from-category or --tag-from-category-id when tagging."
            )
        matches = list(ProductCategory.objects.filter(name__iexact=name.strip()))
        if not matches:
            raise CommandError(
                f"No ProductCategory named {name!r}. Pass --tag-from-category-id."
            )
        if len(matches) > 1:
            ids = ", ".join(str(c.id) for c in matches)
            raise CommandError(
                f"{len(matches)} categories are named {name!r} (ids: {ids}). "
                "Pass --tag-from-category-id to disambiguate."
            )
        return matches[0]

    def _print_category_status(self, category: ProductCategory | None) -> None:
        w = self.stdout.write
        style = self.style
        configured_id = int(getattr(settings, "JERKY_PROMO_CATEGORY_ID", 0) or 0)
        name = jerky_promo_category_name()
        if category is None:
            w(
                style.WARNING(
                    f"No Jerky ProductCategory found "
                    f"(id setting={configured_id or 'unset'}, name={name!r})."
                )
            )
            w(
                "Create one in Django admin under Product categories, or re-run "
                "with --create."
            )
            return

        w(
            style.SUCCESS(
                f"Jerky promo category: {category.name!r} (id={category.id}) — "
                f"{JERKY_5_1.label}"
            )
        )
        if configured_id and configured_id != category.id:
            w(
                style.WARNING(
                    f"  settings.JERKY_PROMO_CATEGORY_ID={configured_id} "
                    f"does not match resolved id={category.id}."
                )
            )
        elif not configured_id:
            w(
                f"  Tip: set JERKY_PROMO_CATEGORY_ID={category.id} to pin this "
                "category (optional; name lookup already works)."
            )

    def _list_eligible(self) -> None:
        w = self.stdout.write
        style = self.style
        ids = get_jerky_promo_category_ids()
        if not ids:
            w(style.WARNING("No Jerky category — no products are eligible."))
            return
        products = (
            Product.objects.filter(categories__id__in=ids)
            .distinct()
            .order_by("name")
        )
        active = [p for p in products if p.active]
        inactive = [p for p in products if not p.active]
        w(
            f"Eligible via Jerky category "
            f"({len(active)} active, {len(inactive)} inactive):"
        )
        for product in products:
            flags = "" if product.active else "  [inactive — not earning]"
            w(f"  - {product.name!r} (id={product.id}){flags}")

    @transaction.atomic
    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style
        dry_run = options["dry_run"]

        category = get_jerky_promo_category()
        created_in_dry_run = False

        if options["create"] and category is None:
            name = jerky_promo_category_name()
            if not name:
                raise CommandError("JERKY_PROMO_CATEGORY_NAME is empty.")
            if dry_run:
                w(
                    style.WARNING(
                        f"Dry run: would create ProductCategory {name!r}."
                    )
                )
                category = ProductCategory(name=name)
                created_in_dry_run = True
            else:
                category = ProductCategory.objects.create(name=name)
                w(
                    style.SUCCESS(
                        f"Created ProductCategory {category.name!r} "
                        f"(id={category.id})."
                    )
                )

        if created_in_dry_run:
            w(
                style.WARNING(
                    f"Jerky promo category (dry-run): {category.name!r} — not saved."
                )
            )
        else:
            self._print_category_status(category)

        tag_name = options["tag_from_category"]
        tag_id = options["tag_from_category_id"]
        if tag_name or tag_id is not None:
            if category is None:
                raise CommandError(
                    "Cannot tag products without a Jerky ProductCategory. "
                    "Pass --create first."
                )
            source = self._resolve_source_category(tag_id, tag_name)
            needle = (options["name_contains"] or "").strip()
            if not needle:
                raise CommandError("--name-contains cannot be empty when tagging.")

            qs = Product.objects.filter(
                categories=source,
                name__icontains=needle,
            ).order_by("id")
            if options["active_only"]:
                qs = qs.filter(active=True)
            candidates = list(qs)
            if category.pk is None:
                already = []
                to_tag = candidates
            else:
                already = [
                    p
                    for p in candidates
                    if p.categories.filter(pk=category.pk).exists()
                ]
                to_tag = [p for p in candidates if p not in already]

            w(
                f"Source {source.name!r} (id={source.id}) — "
                f"{len(candidates)} product(s) matching {needle!r}:"
            )
            for product in candidates:
                marker = "=" if product in already else "+"
                flags = "" if product.active else "  [inactive]"
                w(f"  {marker} {product.name!r} (id={product.id}){flags}")

            if dry_run:
                w(
                    style.WARNING(
                        f"Dry run: would tag {len(to_tag)} product(s) with "
                        f"{category.name!r}; {len(already)} already tagged."
                    )
                )
            else:
                for product in to_tag:
                    product.categories.add(category)
                w(
                    style.SUCCESS(
                        f"Tagged {len(to_tag)} product(s) with {category.name!r}; "
                        f"{len(already)} were already tagged."
                    )
                )

        if options["list"] or not (
            options["create"] or tag_name or tag_id is not None
        ):
            w("")
            if created_in_dry_run:
                w(
                    style.WARNING(
                        "Dry run: no eligible products yet (category not saved)."
                    )
                )
            else:
                self._list_eligible()

        if dry_run:
            transaction.set_rollback(True)
