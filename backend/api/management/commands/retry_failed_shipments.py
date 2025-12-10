"""
Management command to retry shipment creation for failed or pending orders.

Usage:
    python manage.py retry_failed_shipments [--status STATUS] [--limit N] [--order-id ID]
"""

import logging

from api.models import Order
from django.core.management.base import BaseCommand
from django.db.models import Q
from shipping.service import ShippingService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Retry shipment creation for orders with failed or pending shipments"

    def add_arguments(self, parser):
        parser.add_argument(
            "--status",
            type=str,
            default="shipment_failed",
            choices=["shipment_failed", "pending_shipment", "all"],
            help="Filter orders by shipping status (default: shipment_failed)",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Limit number of orders to process",
        )
        parser.add_argument(
            "--order-id",
            type=int,
            default=None,
            help="Process a specific order ID",
        )

    def handle(self, *args, **options):
        status_filter = options["status"]
        limit = options["limit"]
        order_id = options["order_id"]

        self.stdout.write(self.style.SUCCESS("Starting shipment retry process..."))

        # Build queryset
        if order_id:
            # Process specific order
            orders = Order.objects.filter(id=order_id, status="paid")
            if not orders.exists():
                self.stdout.write(
                    self.style.ERROR(
                        f"Order {order_id} not found or not in 'paid' status"
                    )
                )
                return
        else:
            # Filter by status
            orders = Order.objects.filter(
                status="paid", shipping_details__shipping_method_id__isnull=False
            )

            if status_filter == "shipment_failed":
                orders = orders.filter(
                    shipping_details__shipping_status="shipment_failed"
                )
            elif status_filter == "pending_shipment":
                orders = orders.filter(
                    Q(shipping_details__shipping_status="pending_shipment")
                    | Q(shipping_details__shipping_status__isnull=True)
                ).exclude(shipping_details__sendcloud_parcel_id__isnull=False)
            elif status_filter == "all":
                # Process all paid orders without shipments or with failed shipments
                orders = orders.filter(
                    Q(shipping_details__shipping_status="shipment_failed")
                    | Q(shipping_details__shipping_status="pending_shipment")
                    | Q(shipping_details__shipping_status__isnull=True)
                ).exclude(shipping_details__sendcloud_parcel_id__isnull=False)

            if limit:
                orders = orders[:limit]

        total_orders = orders.count()
        self.stdout.write(f"Found {total_orders} order(s) to process")

        if total_orders == 0:
            self.stdout.write(self.style.WARNING("No orders to process"))
            return

        shipping_service = ShippingService()
        success_count = 0
        failed_count = 0
        skipped_count = 0

        for order in orders:
            self.stdout.write(f"\nProcessing Order #{order.id}...")
            details = getattr(order, "shipping_details", None)

            # Skip if no shipping method
            if not details or not details.shipping_method_id:
                self.stdout.write(
                    self.style.WARNING(f"  Skipped: No shipping method configured")
                )
                skipped_count += 1
                continue

            # Skip if already has a shipment
            if details.sendcloud_parcel_id:
                self.stdout.write(
                    self.style.WARNING(
                        f"  Skipped: Already has shipment (parcel_id: {details.sendcloud_parcel_id})"
                    )
                )
                skipped_count += 1
                continue

            try:
                result = shipping_service.create_shipment_for_order(order)

                if result.get("success"):
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✓ Success! Tracking: {result.get('tracking_number')}"
                        )
                    )
                    success_count += 1
                else:
                    error_msg = result.get("error", "Unknown error")
                    self.stdout.write(self.style.ERROR(f"  ✗ Failed: {error_msg}"))
                    failed_count += 1

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ Exception: {str(e)}"))
                logger.error(
                    f"Exception processing order {order.id}: {e}",
                    exc_info=True,
                )
                failed_count += 1

        # Summary
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(self.style.SUCCESS("\nSummary:"))
        self.stdout.write(f"  Total processed: {total_orders}")
        self.stdout.write(self.style.SUCCESS(f"  ✓ Successful: {success_count}"))
        if failed_count > 0:
            self.stdout.write(self.style.ERROR(f"  ✗ Failed: {failed_count}"))
        if skipped_count > 0:
            self.stdout.write(self.style.WARNING(f"  ⊘ Skipped: {skipped_count}"))
        self.stdout.write("=" * 50)
