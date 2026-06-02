from decimal import Decimal

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.test import TestCase
from django.utils import timezone

from admin_dashboard.periods import get_period_range
from admin_dashboard.revenue import (
    REVENUE_ORDER_STATUS,
    paid_orders_in_period,
    sum_paid_order_revenue,
)


class DashboardRevenueTests(TestCase):
    def setUp(self):
        self.customer = CustomUser.objects.create_user(
            name="Revenue Customer",
            email="revenue@example.com",
            password="testpass123",
        )
        self.product = Product.objects.create(
            name="Revenue Product",
            base_price=Decimal("10.00"),
        )

    def _create_order(self, *, status: str, quantity: str = "2") -> Order:
        order = Order.objects.create(
            customer=self.customer,
            status=status,
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=Decimal(quantity),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )
        return order

    def test_revenue_order_status_is_lowercase_paid(self):
        self.assertEqual(REVENUE_ORDER_STATUS, "paid")

    def test_revenue_sums_only_paid_orders(self):
        paid = self._create_order(status="paid", quantity="2")  # 20.00 line
        self._create_order(status="pending", quantity="5")
        self._create_order(status="cancelled", quantity="5")

        paid.refresh_from_db()
        self.assertIsNotNone(paid.created_at)
        self.assertEqual(paid.status, REVENUE_ORDER_STATUS)

        date_from, date_to = get_period_range("7d")
        paid_qs = paid_orders_in_period(date_from, date_to)
        self.assertTrue(paid_qs.filter(pk=paid.pk).exists())

        revenue = sum_paid_order_revenue(date_from, date_to)
        paid_total = Decimal(str(paid.total_price))

        self.assertEqual(revenue, paid_total)
        self.assertEqual(paid_qs.count(), 1)
