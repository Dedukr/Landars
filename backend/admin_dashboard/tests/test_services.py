from decimal import Decimal

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.test import TestCase
from django.utils import timezone

from admin_dashboard.periods import get_period_range
from admin_dashboard.services import (
    get_alerts,
    get_dashboard_data,
    get_reconciliation_breakdown,
    get_summary_snapshot,
)


class AdminDashboardServiceTests(TestCase):
    def setUp(self):
        self.customer = CustomUser.objects.create_user(
            name="Customer",
            email="customer@example.com",
            password="testpass123",
            is_staff=False,
        )
        self.product = Product.objects.create(
            name="Test Product",
            base_price=Decimal("12.50"),
            active=True,
        )

    def test_get_period_range_this_month_starts_on_first_day(self):
        date_from, date_to = get_period_range("this_month")
        self.assertEqual(date_from.day, 1)
        self.assertLess(date_from, date_to)

    def test_get_period_range_invalid_defaults_to_30d(self):
        date_from, _ = get_period_range("not-a-period")
        thirty_from, _ = get_period_range("30d")
        self.assertEqual(date_from.date(), thirty_from.date())

    def test_get_alerts_returns_dict_with_items(self):
        alerts = get_alerts()
        self.assertIsInstance(alerts, dict)
        self.assertIn("items", alerts)
        self.assertIsInstance(alerts["items"], list)
        self.assertIn("pending_orders", alerts)

    def test_get_reconciliation_breakdown_returns_list(self):
        rows = get_reconciliation_breakdown(*get_period_range("7d"))
        self.assertIsInstance(rows, list)

    def test_get_dashboard_data_composes_sections(self):
        Order.objects.create(
            customer=self.customer,
            status="paid",
            source=Order.Source.FRONTEND,
            delivery_date=timezone.localdate(),
            delivery_date_order_id=7,
        )
        OrderItem.objects.create(
            order=Order.objects.first(),
            product=self.product,
            quantity=Decimal("1"),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )

        data = get_dashboard_data("7d")
        self.assertEqual(data["period"], "7d")
        self.assertIn("kpis", data)
        self.assertIn("charts", data)
        self.assertIn("revenue_by_day", data["charts"])
        self.assertIn("orders_by_day", data["charts"])
        self.assertIn("breakdowns", data)
        self.assertIn("reconciliation_by_status", data["breakdowns"])
        self.assertGreaterEqual(data["kpis"]["orders_count"], 1)
        self.assertIsInstance(data["alerts"], list)

    def test_get_summary_snapshot_matches_legacy_shape(self):
        summary = get_summary_snapshot()
        self.assertIn("total_orders", summary)
        self.assertIn("unreconciled_bank_transactions", summary)
