"""
Phase B, step 1 (idempotent, safe to re-run) of the ProductCategory parent -> CategoryGroup
redesign.

For every ProductCategory that currently has children (a structural "parent"):
  - Create a CategoryGroup with the same name + description if one with that exact name
    doesn't already exist, otherwise reuse/merge into the existing group.
  - Add all of that parent's direct children as members of the group.
  - Strip the parent category itself out of the group's membership if it was ever added
    there directly (groups should only ever contain leaf categories going forward).

This command does NOT touch ``ProductCategory.parent`` or ``Product.categories`` — it only
creates/updates ``CategoryGroup`` rows and their M2M membership. It is safe to run multiple
times; re-running just reconciles membership to match the current parent/child tree.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import CategoryGroup, ProductCategory


class Command(BaseCommand):
    help = (
        "Create/merge a CategoryGroup per structural parent ProductCategory, with the "
        "parent's children as members. Idempotent — safe to re-run."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        w = self.stdout.write
        style = self.style

        parents = [
            c for c in ProductCategory.objects.all().order_by("name") if c.subcategories.exists()
        ]

        if not parents:
            w(style.WARNING("No structural parent categories found. Nothing to do."))
            return

        for parent in parents:
            children = list(parent.subcategories.all())

            group, created = CategoryGroup.objects.get_or_create(
                name=parent.name,
                defaults={"description": parent.description or ""},
            )
            if not created and not group.description and parent.description:
                group.description = parent.description
                group.save(update_fields=["description"])

            # Groups must only ever contain leaf categories — drop the parent itself
            # from membership if it was ever added there directly.
            if group.categories.filter(pk=parent.pk).exists():
                group.categories.remove(parent)
                w(
                    style.WARNING(
                        f"  Removed structural parent {parent.name!r} (id={parent.id}) from "
                        f"its own group {group.name!r} (id={group.id}) — parents don't belong "
                        f"in group membership."
                    )
                )

            existing_member_ids = set(group.categories.values_list("id", flat=True))
            child_ids = {c.id for c in children}
            to_add = child_ids - existing_member_ids
            if to_add:
                group.categories.add(*to_add)

            verb = "Created" if created else "Reused/merged into"
            w(
                style.SUCCESS(
                    f"{verb} CategoryGroup {group.name!r} (id={group.id}) for parent "
                    f"{parent.name!r} (id={parent.id}) — {len(children)} children "
                    f"({len(to_add)} newly added, {len(existing_member_ids & child_ids)} already present)."
                )
            )

        w("")
        w(style.SUCCESS(f"Done. Processed {len(parents)} parent categor{'y' if len(parents) == 1 else 'ies'}."))
