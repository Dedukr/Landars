"""
Management command to populate historical item information for existing OrderItems.

This command ensures that all existing order items have their item_name and item_price
fields populated. This is critical for maintaining order history when products are deleted.

Usage:
    python manage.py populate_order_item_history [--dry-run] [--limit N]
"""

from decimal import Decimal

from api.models import OrderItem
from django.core.management.base import BaseCommand
from django.db import models, transaction


class Command(BaseCommand):
    help = "Populate historical item information (item_name, item_price) for existing OrderItems"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without making changes",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Limit number of order items to process (for testing)",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]

        self.stdout.write(
            self.style.SUCCESS("Starting to populate order item historical data...")
        )

        # Find all order items that need updating
        # Items that have a product but missing stored info
        items_with_product = OrderItem.objects.filter(
            product__isnull=False
        ).filter(
            # Missing item_name OR missing item_price
            models.Q(item_name__isnull=True) | models.Q(item_name="")
            | models.Q(item_price__isnull=True)
        )

        # Items that have no product but also no stored info (these are problematic)
        items_without_product = OrderItem.objects.filter(
            product__isnull=True
        ).filter(
            # Missing item_name OR missing item_price
            models.Q(item_name__isnull=True) | models.Q(item_name="")
            | models.Q(item_price__isnull=True)
        )

        total_with_product = items_with_product.count()
        total_without_product = items_without_product.count()

        self.stdout.write(f"\nFound {total_with_product} items with products needing update")
        self.stdout.write(
            self.style.WARNING(
                f"Found {total_without_product} items without products AND without stored info"
            )
        )

        if limit:
            items_with_product = items_with_product[:limit]
            items_without_product = items_without_product[:limit]
            self.stdout.write(f"Processing limited to {limit} items per category")

        if total_with_product == 0 and total_without_product == 0:
            self.stdout.write(
                self.style.SUCCESS("All order items already have historical data!")
            )
            return

        if dry_run:
            self.stdout.write(self.style.WARNING("\n=== DRY RUN MODE ==="))
            self.stdout.write("No changes will be made.\n")

        # Process items with products
        updated_count = 0
        skipped_count = 0
        error_count = 0

        self.stdout.write("\nProcessing items with products...")
        for item in items_with_product:
            try:
                if not item.product:
                    skipped_count += 1
                    continue

                old_name = item.item_name or "(empty)"
                old_price = item.item_price or "(empty)"

                if not dry_run:
                    # Populate stored fields
                    if not item.item_name:
                        item.item_name = item.product.name
                    if item.item_price is None:
                        item.item_price = item.product.price
                    item.save(update_fields=["item_name", "item_price"])

                new_name = item.item_name or item.product.name
                new_price = item.item_price or item.product.price

                self.stdout.write(
                    f"  OrderItem #{item.id}: '{old_name}' → '{new_name}', "
                    f"£{old_price} → £{new_price}"
                )
                updated_count += 1

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"  Error processing OrderItem #{item.id}: {e}")
                )
                error_count += 1

        # Process items without products - set placeholder values so they display correctly
        unrecoverable_count = 0
        if total_without_product > 0:
            self.stdout.write(
                self.style.WARNING("\nProcessing items without products...")
            )
            self.stdout.write(
                self.style.WARNING(
                    "These items have no product reference AND no stored info. "
                    "Setting placeholder values so they display correctly in the admin."
                )
            )

            for item in items_without_product:
                try:
                    if not dry_run:
                        # Set placeholder values so the item at least displays something
                        if not item.item_name:
                            item.item_name = "[Deleted Product - Information Not Available]"
                        if item.item_price is None:
                            # Use a default price of 0.00 so calculations don't break
                            item.item_price = Decimal("0.00")
                        item.save(update_fields=["item_name", "item_price"])
                    
                    self.stdout.write(
                        self.style.WARNING(
                            f"  OrderItem #{item.id}: Set placeholder values. "
                            f"Order: {item.order.id}, Quantity: {item.quantity}"
                        )
                    )
                    unrecoverable_count += 1
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f"  Error processing unrecoverable OrderItem #{item.id}: {e}"
                        )
                    )
                    error_count += 1

        # Summary
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(self.style.SUCCESS("\nSummary:"))
        self.stdout.write(f"  Items with products updated: {updated_count}")
        if unrecoverable_count > 0:
            self.stdout.write(
                self.style.WARNING(
                    f"  Items without products (placeholder values set): {unrecoverable_count}"
                )
            )
        if skipped_count > 0:
            self.stdout.write(f"  Skipped: {skipped_count}")
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f"  Actual errors: {error_count}"))

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\nThis was a dry run. Run without --dry-run to apply changes."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "\n✅ Historical data population completed successfully!"
                )
            )
        self.stdout.write("=" * 50)

