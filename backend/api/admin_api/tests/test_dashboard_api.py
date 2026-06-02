from decimal import Decimal

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from admin_dashboard.periods import get_period_range


class AdminDashboardAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/admin/dashboard/"
        self.staff = CustomUser.objects.create_user(
            name="Staff User",
            email="staff@example.com",
            password="testpass123",
            is_staff=True,
        )
        self.customer = CustomUser.objects.create_user(
            name="Customer User",
            email="customer@example.com",
            password="testpass123",
            is_staff=False,
        )
        self.product = Product.objects.create(
            name="Test Sausage",
            base_price=Decimal("10.00"),
            active=True,
        )

    def test_anonymous_user_cannot_access_admin_dashboard(self):
        response = self.client.get(self.url)
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_normal_user_cannot_access_admin_dashboard(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_user_receives_dashboard_payload(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self.url, {"period": "30d"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["period"], "30d")
        self.assertIn("kpis", response.data)
        self.assertIn("charts", response.data)
        self.assertIn("recent_orders", response.data)
        self.assertIn("breakdowns", response.data)
        self.assertIn("top_products", response.data)
        self.assertIn("alerts", response.data)
        self.assertIn("summary", response.data)
        self.assertIn("revenue_by_day", response.data["charts"])
        self.assertIn("orders_by_day", response.data["charts"])

    def test_invalid_period_defaults_to_30d(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self.url, {"period": "invalid"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["period"], "30d")

    def test_dashboard_uses_real_order_data(self):
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            source=Order.Source.FRONTEND,
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=Decimal("2"),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )

        self.client.force_authenticate(user=self.staff)
        response = self.client.get(self.url, {"period": "7d"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["kpis"]["orders_count"], 1)
        self.assertGreaterEqual(len(response.data["recent_orders"]), 1)
        self.assertTrue(
            any(row["product_id"] == self.product.pk for row in response.data["top_products"])
        )

    def test_legacy_summary_endpoint_still_works(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get("/api/dashboard/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_orders", response.data)


class DashboardPeriodTests(TestCase):
    def test_resolve_this_month_starts_on_first_day(self):
        date_from, _ = get_period_range("this_month")
        self.assertEqual(date_from.day, 1)


class DashboardServiceTests(TestCase):
    def test_get_dashboard_data_returns_safe_empty_sections(self):
        from admin_dashboard.services import get_dashboard_data

        data = get_dashboard_data("7d")
        self.assertEqual(data["period"], "7d")
        self.assertIsInstance(data["recent_orders"], list)
        self.assertIsInstance(data["top_products"], list)
        self.assertIsInstance(data["alerts"], list)
