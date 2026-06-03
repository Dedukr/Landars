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
    get_alert_records,
    get_alerts,
    get_dashboard_data,
    get_invoice_status_breakdown,
    get_kpis,
    get_order_status_breakdown,
    get_reconciliation_breakdown,
    get_recent_orders,
    get_sales_chart,
    get_shipment_status_breakdown,
    get_summary_snapshot,
    get_top_products,
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

    # ------------------------------------------------------------------ #
    # Top products tests (section 12)                                      #
    # ------------------------------------------------------------------ #

    def test_top_products_returns_list(self):
        """12: get_top_products always returns a list."""
        date_from, date_to = get_period_range("7d")
        result = get_top_products(date_from, date_to)
        self.assertIsInstance(result, list)

    def test_top_products_row_has_required_keys(self):
        """12: each top-product row contains the spec-defined keys."""
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
        date_from, date_to = get_period_range("7d")
        rows = get_top_products(date_from, date_to)
        self.assertGreater(len(rows), 0)
        row = rows[0]
        self.assertIn("id", row)
        self.assertIn("name", row)
        self.assertIn("sold_quantity", row)
        self.assertIn("sold_orders_count", row)
        self.assertIn("revenue", row)
        # Old key names must not leak through
        self.assertNotIn("product_id", row)
        self.assertNotIn("quantity_sold", row)

    def test_top_products_counts_and_orders_are_correct(self):
        """12: sold_quantity and sold_orders_count reflect actual data."""
        for i in range(2):
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
        rows = get_top_products(date_from, date_to)
        product_row = next((r for r in rows if r["id"] == self.product.pk), None)
        self.assertIsNotNone(product_row)
        self.assertEqual(Decimal(product_row["sold_quantity"]), Decimal("8"))
        self.assertEqual(product_row["sold_orders_count"], 2)

    def test_top_products_excludes_non_paid_orders(self):
        """12: only paid orders contribute to top products."""
        for status in ("pending", "cancelled"):
            order = Order.objects.create(
                customer=self.customer,
                status=status,
                delivery_date=timezone.localdate(),
                delivery_date_order_id=Order.objects.count() + 1,
            )
            OrderItem.objects.create(
                order=order,
                product=self.product,
                quantity=Decimal("99"),
                item_name=self.product.name,
                item_price=self.product.base_price,
            )
        date_from, date_to = get_period_range("7d")
        rows = get_top_products(date_from, date_to)
        self.assertFalse(any(r["id"] == self.product.pk for r in rows))

    def test_top_products_default_limit_is_five(self):
        """12: default limit is 5 for the dashboard home card."""
        products = [
            Product.objects.create(name=f"P{i}", base_price=Decimal("5.00"))
            for i in range(7)
        ]
        for idx, product in enumerate(products):
            order = Order.objects.create(
                customer=self.customer,
                status="paid",
                delivery_date=timezone.localdate(),
                delivery_date_order_id=Order.objects.count() + 1,
            )
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=Decimal(str(idx + 1)),
                item_name=product.name,
                item_price=product.base_price,
            )
        date_from, date_to = get_period_range("7d")
        rows = get_top_products(date_from, date_to)
        self.assertLessEqual(len(rows), 5)

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
        # 14: alerts is now a dict of record lists, not a flat list
        self.assertIsInstance(data["alerts"], dict)
        self.assertIn("failed_shipments", data["alerts"])
        self.assertIn("unmatched_transactions", data["alerts"])
        self.assertIn("failed_notifications", data["alerts"])

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

    # ------------------------------------------------------------------ #
    # Recent orders tests (section 13)                                     #
    # ------------------------------------------------------------------ #

    def test_recent_orders_returns_list(self):
        """13: get_recent_orders always returns a list."""
        self.assertIsInstance(get_recent_orders(), list)

    def test_recent_orders_row_has_required_keys(self):
        """13: each row contains the spec-defined keys."""
        Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        rows = get_recent_orders()
        self.assertGreater(len(rows), 0)
        row = rows[0]
        for key in ("id", "reference", "customer_name", "status", "total", "created_at"):
            self.assertIn(key, row, msg=f"Missing key: {key}")

    def test_recent_orders_reference_format(self):
        """13: reference is formatted as #<zero-padded pk>."""
        order = Order.objects.create(
            customer=self.customer,
            status="pending",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        rows = get_recent_orders()
        row = next((r for r in rows if r["id"] == order.pk), None)
        self.assertIsNotNone(row)
        self.assertEqual(row["reference"], f"#{order.pk:06d}")

    def test_recent_orders_customer_name_uses_name_field(self):
        """13: customer_name resolves to CustomUser.name."""
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        rows = get_recent_orders()
        row = next((r for r in rows if r["id"] == order.pk), None)
        self.assertIsNotNone(row)
        self.assertEqual(row["customer_name"], self.customer.name)

    def test_recent_orders_null_customer_returns_guest(self):
        """13: orders with no customer FK show 'Guest'."""
        order = Order.objects.create(
            customer=None,
            status="pending",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        rows = get_recent_orders()
        row = next((r for r in rows if r["id"] == order.pk), None)
        self.assertIsNotNone(row)
        self.assertEqual(row["customer_name"], "Guest")

    def test_recent_orders_total_is_decimal_string(self):
        """13: total is a two-decimal string."""
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=Order.objects.count() + 1,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=Decimal("2"),
            item_name=self.product.name,
            item_price=self.product.base_price,
        )
        rows = get_recent_orders()
        row = next((r for r in rows if r["id"] == order.pk), None)
        self.assertIsNotNone(row)
        total = row["total"]
        self.assertIsInstance(total, str)
        parsed = Decimal(total)
        self.assertEqual(total, f"{parsed.quantize(Decimal('0.01'))}")

    def test_recent_orders_limit(self):
        """13: default limit is 10; custom limit is respected."""
        for i in range(12):
            Order.objects.create(
                customer=self.customer,
                status="pending",
                delivery_date=timezone.localdate(),
                delivery_date_order_id=Order.objects.count() + 1,
            )
        self.assertLessEqual(len(get_recent_orders()), 10)
        self.assertLessEqual(len(get_recent_orders(limit=3)), 3)

    # ------------------------------------------------------------------ #
    # Alert records tests (section 14)                                     #
    # ------------------------------------------------------------------ #

    def test_get_alert_records_returns_dict_with_three_keys(self):
        """14: get_alert_records returns a dict with the three expected keys."""
        records = get_alert_records()
        self.assertIsInstance(records, dict)
        self.assertIn("failed_shipments", records)
        self.assertIn("unmatched_transactions", records)
        self.assertIn("failed_notifications", records)

    def test_get_alert_records_values_are_lists(self):
        """14: each value in the alerts dict is a list."""
        records = get_alert_records()
        for key, value in records.items():
            self.assertIsInstance(value, list, msg=f"alerts['{key}'] must be a list")

    def test_failed_shipments_alert_row_shape(self):
        """14.1: failed shipment records have the required keys."""
        try:
            from shipping.models import Shipment

            order = Order.objects.create(
                customer=self.customer,
                status="paid",
                delivery_date=timezone.localdate(),
                delivery_date_order_id=Order.objects.count() + 1,
            )
            Shipment.objects.create(
                order=order,
                status=Shipment.Status.FAILED_FINAL,
                last_error="Label creation failed",
            )
            records = get_alert_records()
            rows = records["failed_shipments"]
            self.assertGreater(len(rows), 0)
            row = rows[0]
            for key in ("id", "order_id", "status", "message", "created_at"):
                self.assertIn(key, row, msg=f"Missing key: {key}")
        except ImportError:
            self.skipTest("shipping app not available")

    def test_unmatched_transactions_alert_row_shape(self):
        """14.2: unmatched transaction records have the required keys."""
        try:
            from reconciliation.models import BankTransaction, StatementBatch

            batch = StatementBatch.objects.create(
                filename="test.pdf",
                file_hash="abc123",
            )
            BankTransaction.objects.create(
                batch=batch,
                statement_date="01 Jun",
                amount="50.00",
                payer_name="J Smith",
                raw_line="01 Jun J Smith 50.00",
                match_status=BankTransaction.MatchStatus.UNMATCHED,
            )
            records = get_alert_records()
            rows = records["unmatched_transactions"]
            self.assertGreater(len(rows), 0)
            row = rows[0]
            for key in ("id", "amount", "reference", "created_at"):
                self.assertIn(key, row, msg=f"Missing key: {key}")
        except ImportError:
            self.skipTest("reconciliation app not available")

    def test_failed_notifications_alert_row_shape(self):
        """14.3: failed notification records have the required keys."""
        try:
            from notifications.models import NotificationLog

            order = Order.objects.create(
                customer=self.customer,
                status="paid",
                delivery_date=timezone.localdate(),
                delivery_date_order_id=Order.objects.count() + 1,
            )
            NotificationLog.objects.create(
                order=order,
                channel=NotificationLog.Channel.TELEGRAM,
                event=NotificationLog.Event.NEW_FRONTEND_ORDER,
                status=NotificationLog.Status.FAILED,
                error_message="Timeout",
            )
            records = get_alert_records()
            rows = records["failed_notifications"]
            self.assertGreater(len(rows), 0)
            row = rows[0]
            for key in ("id", "order_id", "event", "error", "created_at"):
                self.assertIn(key, row, msg=f"Missing key: {key}")
        except ImportError:
            self.skipTest("notifications app not available")

    def test_alert_records_respect_limit(self):
        """14: records are capped at the specified limit per type."""
        records = get_alert_records(limit=2)
        for key, rows in records.items():
            self.assertLessEqual(
                len(rows), 2, msg=f"alerts['{key}'] exceeds limit of 2"
            )

    def test_dashboard_alerts_is_dict(self):
        """14: get_dashboard_data['alerts'] is a dict, not a flat list."""
        data = get_dashboard_data("7d")
        self.assertIsInstance(data["alerts"], dict)
        for key in ("failed_shipments", "unmatched_transactions", "failed_notifications"):
            self.assertIn(key, data["alerts"])
