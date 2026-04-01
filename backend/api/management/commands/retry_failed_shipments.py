"""
Management command to retry shipment creation for failed or pending orders.

Usage:
    python manage.py retry_failed_shipments [--status STATUS] [--limit N] [--order-id ID]
"""

import logging

from api.models import Order
from django.core.management.base import BaseCommand
from django.db.models import Q
from shipping.models import Shipment
from shipping.order_shipping import OrderShippingService
from shipping.sendcloud_shipping import ShippingService

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
            orders = Order.objects.filter(
                id=order_id, status__in=["paid", "ready_to_ship"]
            )
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

            failed_statuses = (
                Shipment.Status.FAILED_RETRYABLE,
                Shipment.Status.FAILED_FINAL,
            )
            if status_filter == "shipment_failed":
                orders = orders.filter(shipping_details__status__in=failed_statuses)
            elif status_filter == "pending_shipment":
                orders = orders.filter(
                    Q(shipping_details__sendcloud_parcel_id__isnull=True)
                    | Q(shipping_details__sendcloud_parcel_id=0)
                ).exclude(shipping_details__status__in=failed_statuses)
            elif status_filter == "all":
                # Paid + method id, still no remote parcel (same idea as legacy filter).
                in_progress = (
                    Shipment.Status.DRAFT,
                    Shipment.Status.PENDING,
                    Shipment.Status.QUEUED,
                    Shipment.Status.CREATING,
                    Shipment.Status.LABEL_DOWNLOAD_PENDING,
                    Shipment.Status.LABEL_DOWNLOAD_FAILED,
                )
                orders = orders.filter(
                    Q(shipping_details__status__in=failed_statuses)
                    | Q(shipping_details__status__in=in_progress)
                ).filter(
                    Q(shipping_details__sendcloud_parcel_id__isnull=True)
                    | Q(shipping_details__sendcloud_parcel_id=0)
                )

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

            if not order.is_home_delivery:
                sh = Shipment.objects.filter(order=order).first()
                if not sh:
                    self.stdout.write(
                        self.style.WARNING("  Skipped: No post shipment record")
                    )
                    skipped_count += 1
                    continue
                if sh.is_label_fully_stored():
                    self.stdout.write(
                        self.style.WARNING("  Skipped: Post shipment already complete")
                    )
                    skipped_count += 1
                    continue
                try:
                    if OrderShippingService.schedule_sendcloud_task(sh.pk):
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  ✓ Queued post shipment task (shipment id {sh.pk})"
                            )
                        )
                        success_count += 1
                    else:
                        self.stdout.write(
                            self.style.WARNING(
                                "  Skipped: shipment terminal or missing"
                            )
                        )
                        skipped_count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"  ✗ Exception: {str(e)}"))
                    failed_count += 1
                continue

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
