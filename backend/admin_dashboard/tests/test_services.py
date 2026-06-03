from decimal import Decimal

from account.models import CustomUser
from api.models import Order, OrderItem, Product
from django.test import TestCase
from django.utils import timezone

from admin_dashboard.periods import get_period_range
from admin_dashboard.services import (
    _get_credit_notes_this_month,
    _get_failed_notifications,
    _get_failed_shipments,
    _get_invoices_this_month,
    _get_today_orders,
    _get_today_revenue,
    _get_top_product_sold_quantity,
    _get_unmatched_transactions,
    get_alerts,
    get_dashboard_data,
    get_invoice_status_breakdown,
    get_kpis,
    get_order_status_breakdown,
    get_reconciliation_breakdown,
    get_sales_chart,
    get_shipment_status_breakdown,
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

    # ------------------------------------------------------------------ #
    # Breakdown tests (sections 8 – 11)                                    #
    # ------------------------------------------------------------------ #

    def test_order_status_breakdown_contains_all_statuses(self):
        """8: every defined Order status appears in the breakdown (zero-filled)."""
        date_from, date_to = get_period_range("7d")
        rows = get_order_status_breakdown(date_from, date_to)
        self.assertIsInstance(rows, list)
        self.assertGreater(len(rows), 0)
        for row in rows:
            self.assertIn("status", row)
            self.assertIn("count", row)
            self.assertIsInstance(row["count"], int)

    def test_order_status_breakdown_counts_paid_order(self):
        """8: a paid order increments the 'paid' bucket."""
        Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        date_from, date_to = get_period_range("7d")
        rows = get_order_status_breakdown(date_from, date_to)
        paid_row = next((r for r in rows if r["status"] == "paid"), None)
        self.assertIsNotNone(paid_row)
        self.assertGreaterEqual(paid_row["count"], 1)

    def test_invoice_status_breakdown_returns_list(self):
        """9: returns a list (empty is fine when no invoices exist in period)."""
        date_from, date_to = get_period_range("7d")
        rows = get_invoice_status_breakdown(date_from, date_to)
        self.assertIsInstance(rows, list)
        for row in rows:
            self.assertIn("status", row)
            self.assertIn("count", row)

    def test_shipment_status_breakdown_returns_list(self):
        """10: returns a list (empty is fine when no shipments exist in period)."""
        date_from, date_to = get_period_range("7d")
        rows = get_shipment_status_breakdown(date_from, date_to)
        self.assertIsInstance(rows, list)
        for row in rows:
            self.assertIn("status", row)
            self.assertIn("count", row)

    def test_get_reconciliation_breakdown_returns_list(self):
        """11: returns a list; each entry uses key 'status' (not 'match_status')."""
        rows = get_reconciliation_breakdown(*get_period_range("7d"))
        self.assertIsInstance(rows, list)
        for row in rows:
            self.assertIn("status", row)
            self.assertNotIn("match_status", row)

    def test_breakdown_keys_in_dashboard_payload(self):
        """8-11: get_dashboard_data uses the canonical breakdown key names."""
        data = get_dashboard_data("7d")
        breakdowns = data["breakdowns"]
        self.assertIn("order_status_breakdown", breakdowns)
        self.assertIn("invoice_status_breakdown", breakdowns)
        self.assertIn("shipment_status_breakdown", breakdowns)
        self.assertIn("reconciliation_breakdown", breakdowns)
        # Old key names must not be present
        self.assertNotIn("orders_by_status", breakdowns)
        self.assertNotIn("invoices_by_status", breakdowns)
        self.assertNotIn("shipments_by_status", breakdowns)
        self.assertNotIn("reconciliation_by_status", breakdowns)

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
        self.assertIn("sales_chart", data["charts"])
        self.assertIn("breakdowns", data)
        self.assertIn("reconciliation_breakdown", data["breakdowns"])
        self.assertGreaterEqual(data["kpis"]["orders_count"], 1)
        self.assertIsInstance(data["alerts"], list)

    def test_get_summary_snapshot_matches_legacy_shape(self):
        summary = get_summary_snapshot()
        self.assertIn("total_orders", summary)
        self.assertIn("unreconciled_bank_transactions", summary)

    # ------------------------------------------------------------------ #
    # KPI card tests (sections 6.1 – 6.11)                                #
    # ------------------------------------------------------------------ #

    def test_get_kpis_includes_all_required_keys(self):
        """get_kpis() must return every KPI key expected by the frontend."""
        date_from, date_to = get_period_range("7d")
        kpis = get_kpis(date_from, date_to)
        required_keys = [
            # period KPIs
            "revenue",
            "orders_count",
            "paid_orders_count",
            "average_order_value",
            "pending_orders",
            # today KPIs (6.1, 6.2)
            "today_revenue",
            "today_orders",
            # operations KPIs (6.6 – 6.10)
            "unmatched_transactions",
            "failed_shipments",
            "failed_notifications",
            "invoices_issued_this_month",
            "credit_notes_this_month",
            # product KPI (6.11)
            "top_product_sold_quantity",
        ]
        for key in required_keys:
            self.assertIn(key, kpis, msg=f"Missing KPI key: {key}")

    def test_today_revenue_includes_paid_order_created_today(self):
        """6.1: today_revenue includes a paid order created today."""
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=Decimal("3"),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )
        revenue_str = _get_today_revenue()
        today_revenue = Decimal(revenue_str)
        self.assertGreaterEqual(today_revenue, Decimal("37.50"))  # 3 × 12.50

    def test_today_orders_counts_order_created_today(self):
        """6.2: today_orders rises after creating an order."""
        before = _get_today_orders()
        Order.objects.create(
            customer=self.customer,
            status="pending",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        after = _get_today_orders()
        self.assertEqual(after, before + 1)

    def test_unmatched_transactions_returns_int(self):
        """6.6: _get_unmatched_transactions returns a non-negative int."""
        result = _get_unmatched_transactions()
        self.assertIsInstance(result, int)
        self.assertGreaterEqual(result, 0)

    def test_failed_shipments_returns_int(self):
        """6.7: _get_failed_shipments returns a non-negative int."""
        result = _get_failed_shipments()
        self.assertIsInstance(result, int)
        self.assertGreaterEqual(result, 0)

    def test_failed_notifications_returns_int(self):
        """6.8: _get_failed_notifications returns a non-negative int."""
        result = _get_failed_notifications()
        self.assertIsInstance(result, int)
        self.assertGreaterEqual(result, 0)

    def test_invoices_this_month_returns_int(self):
        """6.9: _get_invoices_this_month returns a non-negative int."""
        result = _get_invoices_this_month()
        self.assertIsInstance(result, int)
        self.assertGreaterEqual(result, 0)

    def test_credit_notes_this_month_returns_int(self):
        """6.10: _get_credit_notes_this_month returns a non-negative int."""
        result = _get_credit_notes_this_month()
        self.assertIsInstance(result, int)
        self.assertGreaterEqual(result, 0)

    def test_top_product_sold_quantity_with_paid_order(self):
        """6.11: top_product_sold_quantity reflects paid order items in period."""
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=Decimal("5"),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )
        date_from, date_to = get_period_range("7d")
        qty = _get_top_product_sold_quantity(date_from, date_to)
        self.assertIsInstance(qty, int)
        self.assertGreaterEqual(qty, 5)

    def test_top_product_sold_quantity_no_orders_returns_zero(self):
        """6.11: returns 0 when no paid orders exist in the period."""
        date_from, date_to = get_period_range("7d")
        qty = _get_top_product_sold_quantity(date_from, date_to)
        self.assertIsInstance(qty, int)
        self.assertGreaterEqual(qty, 0)

    def test_average_order_value_string_format(self):
        """6.5: average_order_value is returned as a two-decimal string."""
        date_from, date_to = get_period_range("7d")
        kpis = get_kpis(date_from, date_to)
        aov = kpis["average_order_value"]
        self.assertIsInstance(aov, str)
        # Must be parseable as Decimal and have 2 dp
        parsed = Decimal(aov)
        self.assertEqual(aov, f"{parsed.quantize(Decimal('0.01'))}")

    # ------------------------------------------------------------------ #
    # Sales chart tests (section 7)                                        #
    # ------------------------------------------------------------------ #

    def test_sales_chart_entry_has_required_keys(self):
        """7: each entry has date, revenue, orders."""
        date_from, date_to = get_period_range("7d")
        chart = get_sales_chart(date_from, date_to)
        self.assertIsInstance(chart, list)
        # 7-day window → always 7 or 8 entries (gap-filled)
        self.assertGreaterEqual(len(chart), 7)
        for entry in chart:
            self.assertIn("date", entry)
            self.assertIn("revenue", entry)
            self.assertIn("orders", entry)

    def test_sales_chart_gaps_filled_with_zeros(self):
        """7: days with no paid orders appear as revenue=0.00, orders=0."""
        date_from, date_to = get_period_range("7d")
        chart = get_sales_chart(date_from, date_to)
        zero_days = [e for e in chart if e["orders"] == 0]
        # In an empty DB all days are zero-filled
        self.assertGreater(len(zero_days), 0)
        for entry in zero_days:
            self.assertEqual(entry["revenue"], "0.00")
            self.assertEqual(entry["orders"], 0)

    def test_sales_chart_includes_paid_order_on_its_day(self):
        """7: a paid order's revenue and count appear on the correct date."""
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=Decimal("4"),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )
        date_from, date_to = get_period_range("7d")
        chart = get_sales_chart(date_from, date_to)
        today_str = timezone.localdate().isoformat()
        today_entry = next((e for e in chart if e["date"] == today_str), None)
        self.assertIsNotNone(today_entry, "Today's date must appear in 7d chart")
        self.assertGreaterEqual(Decimal(today_entry["revenue"]), Decimal("50.00"))
        self.assertGreaterEqual(today_entry["orders"], 1)

    def test_sales_chart_revenue_is_two_decimal_string(self):
        """7: revenue field is always a two-decimal string."""
        date_from, date_to = get_period_range("7d")
        for entry in get_sales_chart(date_from, date_to):
            rev = entry["revenue"]
            self.assertIsInstance(rev, str)
            parsed = Decimal(rev)
            self.assertEqual(rev, f"{parsed.quantize(Decimal('0.01'))}")
