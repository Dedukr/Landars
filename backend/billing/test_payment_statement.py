"""
Tests for the Paid Orders Payment Statement service and admin page.
"""

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from api.models import Order, OrderItem, Product
from billing.forms import PaymentStatementForm
from billing.models import CreditNote, Invoice
from billing.services.payment_statement import (
    PaymentStatementError,
    build_payment_statement,
    format_gbp,
    inclusive_date_range_bounds,
    render_payment_statement_csv,
    render_payment_statement_html,
    render_payment_statement_pdf,
)

User = get_user_model()
LONDON = ZoneInfo("Europe/London")


def issue_invoice(order, *, total=None, vat=None) -> Invoice:
    """Create an issued invoice with line items (no PDF / S3)."""
    invoice = Invoice(order=order)
    invoice.issue_from_order()
    invoice.allocate_invoice_number_if_needed()
    invoice.save()
    invoice.build_line_items_from_order()
    if total is not None or vat is not None:
        update = []
        if total is not None:
            invoice.total_amount = Decimal(str(total))
            update.append("total_amount")
        if vat is not None:
            invoice.vat_amount = Decimal(str(vat))
            update.append("vat_amount")
        invoice.save(update_fields=update)
    invoice.refresh_from_db()
    return invoice


def mark_invoice_paid(invoice: Invoice, paid_at: datetime) -> Invoice:
    invoice.amount_paid = invoice.total_amount
    invoice.status = Invoice.Status.PAID
    invoice.paid_at = paid_at
    invoice.save(update_fields=["amount_paid", "status", "paid_at"])
    invoice.refresh_from_db()
    return invoice


def credit_invoice(invoice: Invoice, *, created_at: datetime | None = None) -> CreditNote:
    note = CreditNote(invoice=invoice, reason="Customer returned the order")
    note.copy_snapshots_from_invoice()
    note.allocate_credit_note_number_if_needed()
    note.save()
    note.build_line_items_from_invoice()
    invoice.status = Invoice.Status.VOID
    invoice.voided_at = timezone.now()
    invoice.void_reason = f"Cancelled by Credit Note #{note.credit_note_number}"
    invoice.save(update_fields=["status", "voided_at", "void_reason"])
    if created_at is not None:
        CreditNote.objects.filter(pk=note.pk).update(created_at=created_at)
        note.refresh_from_db()
    return note


@override_settings(TIME_ZONE="Europe/London")
class PaymentStatementServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="statement@example.com",
            password="SecurePass123!",
            first_name="Sam",
            surname="Buyer",
            is_email_verified=True,
        )
        self.vat_product = Product.objects.create(
            name="VAT Pie",
            base_price=Decimal("12.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=True,
        )
        self.zero_product = Product.objects.create(
            name="Zero Bread",
            base_price=Decimal("5.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )

    def _order(self, *, status="paid", delivery_id=1, **extra) -> Order:
        order = Order.objects.create(
            customer=self.user,
            status=status,
            delivery_date=timezone.localdate(),
            delivery_date_order_id=delivery_id,
            **extra,
        )
        return order

    def test_inclusive_date_range_bounds_half_open_london(self):
        start, end = inclusive_date_range_bounds(
            date(2026, 9, 1), date(2026, 9, 30)
        )
        self.assertEqual(start, datetime(2026, 9, 1, 0, 0, tzinfo=LONDON))
        self.assertEqual(end, datetime(2026, 10, 1, 0, 0, tzinfo=LONDON))

    def test_from_after_to_raises(self):
        with self.assertRaises(PaymentStatementError):
            inclusive_date_range_bounds(date(2026, 9, 30), date(2026, 9, 1))

    def test_includes_paid_inside_range_excludes_unpaid_and_outside(self):
        inside = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=inside, product=self.zero_product, quantity=Decimal("1")
        )
        inv_inside = issue_invoice(inside)
        mark_invoice_paid(
            inv_inside,
            datetime(2026, 9, 15, 12, 0, tzinfo=LONDON),
        )

        unpaid = self._order(delivery_id=2, status="issued")
        OrderItem.objects.create(
            order=unpaid, product=self.zero_product, quantity=Decimal("1")
        )
        issue_invoice(unpaid)  # ISSUED, no paid_at

        outside = self._order(delivery_id=3)
        OrderItem.objects.create(
            order=outside, product=self.zero_product, quantity=Decimal("2")
        )
        inv_outside = issue_invoice(outside)
        mark_invoice_paid(
            inv_outside,
            datetime(2026, 8, 31, 23, 0, tzinfo=LONDON),
        )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(statement.paid_transaction_count, 1)
        self.assertEqual(len(statement.rows), 1)
        self.assertEqual(statement.rows[0].order_reference, f"Order #{inside.id}")

    def test_inclusive_boundaries(self):
        early = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=early, product=self.zero_product, quantity=Decimal("1")
        )
        inv_early = issue_invoice(early)
        mark_invoice_paid(
            inv_early,
            datetime(2026, 9, 1, 0, 0, 0, tzinfo=LONDON),
        )

        late = self._order(delivery_id=2)
        OrderItem.objects.create(
            order=late, product=self.zero_product, quantity=Decimal("1")
        )
        inv_late = issue_invoice(late)
        # Last instant of 30 Sep London is still < 1 Oct 00:00
        mark_invoice_paid(
            inv_late,
            datetime(2026, 9, 30, 23, 59, 59, tzinfo=LONDON),
        )

        just_after = self._order(delivery_id=3)
        OrderItem.objects.create(
            order=just_after, product=self.zero_product, quantity=Decimal("1")
        )
        inv_after = issue_invoice(just_after)
        mark_invoice_paid(
            inv_after,
            datetime(2026, 10, 1, 0, 0, 0, tzinfo=LONDON),
        )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        refs = {r.order_reference for r in statement.rows}
        self.assertIn(f"Order #{early.id}", refs)
        self.assertIn(f"Order #{late.id}", refs)
        self.assertNotIn(f"Order #{just_after.id}", refs)
        self.assertEqual(statement.paid_transaction_count, 2)

    def test_timezone_boundary_utc_vs_london(self):
        """
        23:30 UTC on 31 Aug is still 00:30 BST on 1 Sep in Europe/London (BST).
        That payment must fall inside a 1–30 Sep statement.
        """
        order = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("1")
        )
        invoice = issue_invoice(order)
        # Store as UTC; Django USE_TZ will keep it aware.
        paid_at_utc = datetime(2026, 8, 31, 23, 30, tzinfo=ZoneInfo("UTC"))
        mark_invoice_paid(invoice, paid_at_utc)

        # Confirm local date is 1 Sep 2026 in London.
        local = paid_at_utc.astimezone(LONDON)
        self.assertEqual(local.date(), date(2026, 9, 1))

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(statement.paid_transaction_count, 1)
        self.assertEqual(statement.rows[0].payment_date, date(2026, 9, 1))

        with self.assertRaises(PaymentStatementError):
            build_payment_statement(date(2026, 8, 1), date(2026, 8, 31))

    def test_net_vat_gross_and_totals(self):
        order = self._order(delivery_id=1, delivery_fee=Decimal("2.50"))
        OrderItem.objects.create(
            order=order, product=self.vat_product, quantity=Decimal("1")
        )
        invoice = issue_invoice(order)
        # Authoritative stored values (simulate snapshot).
        invoice.total_amount = Decimal("14.50")
        invoice.vat_amount = Decimal("2.00")
        invoice.save(update_fields=["total_amount", "vat_amount"])
        mark_invoice_paid(
            invoice, datetime(2026, 9, 10, 10, 0, tzinfo=LONDON)
        )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        row = statement.rows[0]
        self.assertEqual(row.net_amount, Decimal("12.50"))
        self.assertEqual(row.vat_amount, Decimal("2.00"))
        self.assertEqual(row.gross_amount, Decimal("14.50"))
        self.assertEqual(row.net_amount + row.vat_amount, row.gross_amount)
        self.assertEqual(statement.total_net, Decimal("12.50"))
        self.assertEqual(statement.total_vat, Decimal("2.00"))
        self.assertEqual(statement.total_gross, Decimal("14.50"))
        self.assertEqual(
            statement.total_net + statement.total_vat, statement.total_gross
        )
        self.assertIsInstance(row.net_amount, Decimal)
        self.assertEqual(format_gbp(row.gross_amount), "£14.50")

    def test_discount_baked_into_stored_totals(self):
        order = self._order(
            delivery_id=1,
            discount=Decimal("3.00"),
        )
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("2")
        )
        invoice = issue_invoice(order)
        # issue_from_order snapshots Order.total_price which already nets discount.
        self.assertEqual(invoice.total_amount, Decimal("7.00"))  # 10 - 3
        mark_invoice_paid(
            invoice, datetime(2026, 9, 12, 9, 0, tzinfo=LONDON)
        )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(statement.rows[0].gross_amount, Decimal("7.00"))

    def test_customer_invoice_and_payment_reference(self):
        order = self._order(delivery_id=1)
        order.payment_intent_id = "pi_test_abc"
        order.payment_status = "succeeded"
        order.save(update_fields=["payment_intent_id", "payment_status"])
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("1")
        )
        invoice = issue_invoice(order)
        invoice.billing_address_snapshot = {
            **(invoice.billing_address_snapshot or {}),
            "company_name": "Acme Foods Ltd",
        }
        invoice.stripe_payment_intent_id = "pi_invoice_xyz"
        invoice.save(
            update_fields=["billing_address_snapshot", "stripe_payment_intent_id"]
        )
        mark_invoice_paid(
            invoice, datetime(2026, 9, 5, 11, 0, tzinfo=LONDON)
        )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        row = statement.rows[0]
        self.assertIn("Sam", row.customer)
        self.assertEqual(row.customer_business_name, "Acme Foods Ltd")
        self.assertEqual(row.order_reference, f"Order #{order.id}")
        self.assertTrue(row.invoice_number.startswith("LF-"))
        self.assertEqual(row.transaction_reference, "pi_invoice_xyz")
        self.assertEqual(row.payment_method, "Pay by Bank (Stripe)")

    def test_zero_transactions_raises_no_empty_statement(self):
        with self.assertRaises(PaymentStatementError) as ctx:
            build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        self.assertIn("No paid transactions", str(ctx.exception))

    def test_multiple_transactions_totals_sum_of_rows(self):
        amounts = [
            (Decimal("10.00"), Decimal("0.00")),
            (Decimal("24.00"), Decimal("4.00")),
            (Decimal("6.50"), Decimal("0.00")),
        ]
        for i, (gross, vat) in enumerate(amounts, start=1):
            order = self._order(delivery_id=i)
            OrderItem.objects.create(
                order=order, product=self.zero_product, quantity=Decimal("1")
            )
            inv = issue_invoice(order, total=gross, vat=vat)
            mark_invoice_paid(
                inv,
                datetime(2026, 9, i, 12, 0, tzinfo=LONDON),
            )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(len(statement.rows), 3)
        self.assertEqual(
            statement.total_gross,
            sum((r.gross_amount for r in statement.rows), Decimal("0")),
        )
        self.assertEqual(
            statement.total_net,
            sum((r.net_amount for r in statement.rows), Decimal("0")),
        )
        self.assertEqual(
            statement.total_vat,
            sum((r.vat_amount for r in statement.rows), Decimal("0")),
        )
        self.assertEqual(statement.total_net + statement.total_vat, statement.total_gross)

    def test_refund_credit_note_as_negative_row(self):
        order = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("1")
        )
        invoice = issue_invoice(order, total=Decimal("5.00"), vat=Decimal("0.00"))
        mark_invoice_paid(
            invoice, datetime(2026, 9, 10, 10, 0, tzinfo=LONDON)
        )
        credit_invoice(
            invoice,
            created_at=datetime(2026, 9, 20, 15, 0, tzinfo=LONDON),
        )

        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        kinds = [r.row_kind for r in statement.rows]
        self.assertEqual(kinds.count("payment"), 1)
        self.assertEqual(kinds.count("credit_note"), 1)
        credit_row = next(r for r in statement.rows if r.row_kind == "credit_note")
        self.assertEqual(credit_row.gross_amount, Decimal("-5.00"))
        self.assertEqual(credit_row.net_amount, Decimal("-5.00"))
        # Net revenue for the month after full credit is zero.
        self.assertEqual(statement.total_gross, Decimal("0.00"))
        self.assertEqual(statement.paid_transaction_count, 1)

    def test_period_display_and_html_context_has_no_live_recalc(self):
        order = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("1")
        )
        inv = issue_invoice(order, total=Decimal("5.00"), vat=Decimal("0"))
        mark_invoice_paid(
            inv, datetime(2026, 9, 5, 8, 0, tzinfo=LONDON)
        )
        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(
            statement.period_display, "1 September 2026 – 30 September 2026"
        )
        html = render_payment_statement_html(statement)
        self.assertIn("Payment Statement", html)
        self.assertIn("Period: 1 September 2026 – 30 September 2026", html)
        self.assertIn(statement.rows[0].gross_display, html)
        self.assertIn("not a customer invoice", html.lower())
        self.assertNotIn("Txn Ref", html)
        self.assertIn(">Notes<", html)

    def test_csv_uses_same_dataset(self):
        order = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("1")
        )
        inv = issue_invoice(order, total=Decimal("5.00"), vat=Decimal("0"))
        mark_invoice_paid(
            inv, datetime(2026, 9, 5, 8, 0, tzinfo=LONDON)
        )
        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        csv_bytes = render_payment_statement_csv(statement)
        text = csv_bytes.decode("utf-8-sig")
        header = text.splitlines()[0]
        self.assertEqual(
            header,
            "Payment Date,Order Reference,Invoice Number,Customer,"
            "Business Name,Payment Method,VAT Rate,Net Amount,VAT Amount,Gross Amount,Notes",
        )
        for removed in (
            "Transaction Reference",
            "Order Date",
            "Row Kind",
        ):
            self.assertNotIn(removed, header)
        self.assertIn(f"Order #{order.id}", text)
        self.assertIn("5.00", text)

    def test_pdf_renders_non_empty_bytes(self):
        order = self._order(delivery_id=1)
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("1")
        )
        inv = issue_invoice(order, total=Decimal("5.00"), vat=Decimal("0"))
        mark_invoice_paid(
            inv, datetime(2026, 9, 5, 8, 0, tzinfo=LONDON)
        )
        statement = build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))
        pdf_bytes = render_payment_statement_pdf(statement)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
        self.assertGreater(len(pdf_bytes), 500)

    def test_part_paid_excluded(self):
        order = self._order(delivery_id=1, status="issued")
        OrderItem.objects.create(
            order=order, product=self.zero_product, quantity=Decimal("2")
        )
        inv = issue_invoice(order, total=Decimal("10.00"), vat=Decimal("0"))
        inv.amount_paid = Decimal("4.00")
        inv.status = Invoice.Status.PART_PAID
        inv.paid_at = datetime(2026, 9, 8, 12, 0, tzinfo=LONDON)
        inv.save(update_fields=["amount_paid", "status", "paid_at"])

        with self.assertRaises(PaymentStatementError):
            build_payment_statement(date(2026, 9, 1), date(2026, 9, 30))


class PaymentStatementFormTests(TestCase):
    def test_invalid_range(self):
        form = PaymentStatementForm(
            data={
                "from_date": "2026-09-30",
                "to_date": "2026-09-01",
                "output_format": "pdf",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("to_date", form.errors)

    def test_missing_dates(self):
        form = PaymentStatementForm(data={"output_format": "pdf"})
        self.assertFalse(form.is_valid())
        self.assertIn("from_date", form.errors)
        self.assertIn("to_date", form.errors)


@override_settings(TIME_ZONE="Europe/London")
class PaymentStatementAdminTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin-statement@example.com",
            password="SecurePass123!",
            first_name="Admin",
            surname="User",
            is_email_verified=True,
        )
        self.client = Client()
        self.client.force_login(self.admin)
        self.url = reverse("admin:api_order_payment_statement")

        self.customer = User.objects.create_user(
            email="cust-statement@example.com",
            password="SecurePass123!",
            first_name="Cust",
            surname="Omer",
            is_email_verified=True,
        )
        self.product = Product.objects.create(
            name="Admin Bread",
            base_price=Decimal("5.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
        )

    def test_get_form_page(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Generate Payment Statement")
        self.assertContains(response, "From")

    def test_post_empty_range_shows_error_not_pdf(self):
        response = self.client.post(
            self.url,
            {
                "from_date": "2026-09-01",
                "to_date": "2026-09-30",
                "output_format": "pdf",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "No paid transactions")
        self.assertEqual(response.get("Content-Type", ""), "text/html; charset=utf-8")

    def test_post_csv_download(self):
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
        )
        OrderItem.objects.create(
            order=order, product=self.product, quantity=Decimal("1")
        )
        inv = issue_invoice(order, total=Decimal("5.00"), vat=Decimal("0"))
        mark_invoice_paid(
            inv, datetime(2026, 9, 10, 12, 0, tzinfo=LONDON)
        )

        response = self.client.post(
            self.url,
            {
                "from_date": "2026-09-01",
                "to_date": "2026-09-30",
                "output_format": "csv",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("attachment", response["Content-Disposition"])
        body = response.content.decode("utf-8-sig")
        self.assertIn(f"Order #{order.id}", body)

    def test_changelist_has_statement_link(self):
        response = self.client.get(reverse("admin:api_order_changelist"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Generate Payment Statement")
        self.assertContains(response, "/admin/api/order/payment-statement/")

    def test_invoice_changelist_has_no_statement_link(self):
        response = self.client.get(reverse("admin:billing_invoice_changelist"))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "Generate Payment Statement")
        self.assertNotContains(response, "payment-statement")
