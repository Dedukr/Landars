"""
Phase A (read-only) audit for the ProductCategory parent/child -> CategoryGroup redesign.

Reports, without modifying any data:
  - Categories that have children (``subcategories.exists()``)
  - Standalone leaf categories (no parent, no children)
  - Any 3+ level chains (a category whose parent itself has a parent)
  - Categories that are BOTH tagged directly on products AND have children
    (these need special handling since parents are meant to be purely structural)
  - Existing CategoryGroup membership overlaps with parent categories
    (a CategoryGroup that already contains a category which has children)
  - Counts of products per category (leaf categories only, and parents)

This command makes NO changes to the database. Run it first and re-run it after each
subsequent data-migration step to confirm expectations.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Count

from api.models import CategoryGroup, Product, ProductCategory


class Command(BaseCommand):
    help = "Read-only audit of the ProductCategory parent/child tree ahead of the CategoryGroup redesign."

    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style

        all_categories = list(
            ProductCategory.objects.all().select_related("parent").order_by("name")
        )
        by_id = {c.id: c for c in all_categories}

        parents = [c for c in all_categories if c.subcategories.exists()]
        leaves_no_parent = [
            c for c in all_categories if c.parent_id is None and not c.subcategories.exists()
        ]
        leaves_with_parent = [
            c for c in all_categories if c.parent_id is not None and not c.subcategories.exists()
        ]

        w(style.MIGRATE_HEADING("=== Category counts ==="))
        w(f"Total ProductCategory rows: {len(all_categories)}")
        w(f"Categories with children (structural parents): {len(parents)}")
        w(f"Leaf categories with NO parent (top-level standalone leaves): {len(leaves_no_parent)}")
        w(f"Leaf categories WITH a parent (normal children): {len(leaves_with_parent)}")

        w("")
        w(style.MIGRATE_HEADING("=== 3+ level chains (grandparent -> parent -> child) ==="))
        chains = []
        for c in all_categories:
            if c.parent_id and c.parent and c.parent.parent_id:
                chains.append(c)
        if chains:
            for c in chains:
                grandparent = c.parent.parent
                w(
                    style.WARNING(
                        f"  {grandparent.name!r} (id={grandparent.id}) -> "
                        f"{c.parent.name!r} (id={c.parent.id}) -> {c.name!r} (id={c.id})"
                    )
                )
        else:
            w("  None found — tree is at most 2 levels deep.")

        w("")
        w(style.MIGRATE_HEADING("=== Parent categories directly tagged on products (should be none) ==="))
        parents_with_products = []
        for c in parents:
            direct_product_count = c.products.count()
            if direct_product_count > 0:
                parents_with_products.append((c, direct_product_count))
        if parents_with_products:
            for c, count in parents_with_products:
                w(
                    style.ERROR(
                        f"  {c.name!r} (id={c.id}) has children AND is directly tagged on "
                        f"{count} product(s) — needs care: category must stay assigned until "
                        f"the strip-parent-tags command confirms replacement leaf coverage."
                    )
                )
        else:
            w("  None — all structural parents are untagged on products directly. Good.")

        w("")
        w(style.MIGRATE_HEADING("=== Existing CategoryGroup membership overlapping with parent categories ==="))
        groups = list(CategoryGroup.objects.prefetch_related("categories").order_by("name"))
        overlap_found = False
        for g in groups:
            members = list(g.categories.all())
            parent_members = [m for m in members if m.subcategories.exists()]
            if parent_members:
                overlap_found = True
                names = ", ".join(f"{m.name!r} (id={m.id})" for m in parent_members)
                w(
                    style.WARNING(
                        f"  Group {g.name!r} (id={g.id}) directly contains structural parent "
                        f"categories: {names} — these will be replaced by their children."
                    )
                )
        if not overlap_found:
            w("  None found.")

        w("")
        w(style.MIGRATE_HEADING("=== Per-parent breakdown (name, id, direct children, own product count) ==="))
        for c in sorted(parents, key=lambda x: x.name.lower()):
            children = list(c.subcategories.all().order_by("name"))
            child_names = ", ".join(f"{ch.name!r} (id={ch.id})" for ch in children)
            w(f"  Parent {c.name!r} (id={c.id}) — {len(children)} children: {child_names}")

        w("")
        w(style.MIGRATE_HEADING("=== Product-category tag counts per LEAF category (baseline for later validation) ==="))
        leaf_ids = [c.id for c in all_categories if not c.subcategories.exists()]
        counts = (
            ProductCategory.objects.filter(id__in=leaf_ids)
            .annotate(n=Count("products", distinct=True))
            .values("id", "name", "n")
            .order_by("name")
        )
        total_leaf_tags = 0
        for row in counts:
            total_leaf_tags += row["n"]
            w(f"  {row['name']!r} (id={row['id']}): {row['n']} product(s)")
        w(style.SUCCESS(f"Total leaf-category product tags: {total_leaf_tags}"))

        w("")
        w(style.MIGRATE_HEADING("=== Products with zero categories (pre-existing, informational) ==="))
        zero_cat_products = Product.objects.filter(categories__isnull=True).count()
        w(f"  {zero_cat_products} product(s) currently have zero categories.")

        w("")
        w(style.MIGRATE_HEADING("=== CategoryGroup summary ==="))
        w(f"Total CategoryGroup rows: {len(groups)}")
        for g in groups:
            w(f"  Group {g.name!r} (id={g.id}) — {g.categories.count()} member categories")

        w("")
        w(style.SUCCESS("Audit complete. No data was modified."))
