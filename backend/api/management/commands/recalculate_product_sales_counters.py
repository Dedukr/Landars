"""
Recompute denormalised ``Product.sold_quantity`` and ``sold_orders_count`` from orders.

Use after data imports, raw SQL, or fixing drift. Normal ORM status changes
(``set_order_status`` / ``bulk_set_order_status`` / ``OrderQuerySet.update``) schedule
rebuilds automatically.
"""

from django.core.management.base import BaseCommand

from api.services.product_sales import rebuild_all_product_sales_counters


class Command(BaseCommand):
    help = (
        "Recalculate sold_quantity and sold_orders_count on every product that "
        "appears on at least one order line (from paid / ready_to_ship / issued orders)."
    )

    def handle(self, *args, **options):
        n = rebuild_all_product_sales_counters()
        self.stdout.write(self.style.SUCCESS(f"Rebuilt sales counters for {n} product(s) with order lines."))
