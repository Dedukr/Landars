"""
Invoice / credit-note coverage for the automatic Jerky 5+1 promotion.

An invoice is an accounting snapshot, so the promo must be frozen at issuance
(document total, label, and per-line free units) and carried verbatim onto the
credit note that cancels it. PDF rendering and S3 upload are skipped here: the
tests follow the same sequence as ``create_and_publish_from_order`` minus the
document generation.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from api.models import Order, OrderItem, Product
from billing.models import CreditNote, Invoice

User = get_user_model()


def issue_invoice(order) -> Invoice:
    """Create an issued invoice with line items (no PDF, no S3)."""
    invoice = Invoice(order=order)
    invoice.issue_from_order()
    invoice.allocate_invoice_number_if_needed()
    invoice.save()
    invoice.build_line_items_from_order()
    invoice.refresh_from_db()
    return invoice


def credit(invoice) -> CreditNote:
    """Create a credit note with copied line items (no PDF, no S3)."""
    note = CreditNote(invoice=invoice, reason="Customer returned the order")
    note.copy_snapshots_from_invoice()
    note.allocate_credit_note_number_if_needed()
    note.save()
    note.build_line_items_from_invoice()
    note.refresh_from_db()
    return note


class InvoicePromoSnapshotTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="invoice-promo@example.com",
            password="SecurePass123!",
            first_name="Invoice",
            surname="Promo",
            is_email_verified=True,
        )
        self.jerky = Product.objects.create(
            name="Beef Jerky",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=False,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
            promo_discount=Decimal("6.00"),
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )

    def test_invoice_snapshots_the_promo_total_and_label(self):
        invoice = issue_invoice(self.order)

        self.assertEqual(invoice.promo_discount_amount, Decimal("6.00"))
        self.assertEqual(invoice.promo_label, "Jerky 5+1")
        self.assertEqual(invoice.discount_amount, Decimal("0.00"))
        # total_amount mirrors Order.total_price, which is already net of the promo.
        self.assertEqual(invoice.total_amount, Decimal("30.00"))

    def test_invoice_line_item_carries_free_units_and_their_value(self):
        invoice = issue_invoice(self.order)
        line = invoice.line_items.get()

        self.assertEqual(line.quantity, Decimal("6.00"))
        self.assertEqual(line.unit_gross, Decimal("6.00"))
        # quantity / line_total stay gross; the promo is deducted separately.
        self.assertEqual(line.line_total, Decimal("36.00"))
        self.assertEqual(line.free_quantity, Decimal("1.00"))
        self.assertEqual(line.promo_discount, Decimal("6.00"))
        self.assertEqual(line.net_line_total, Decimal("30.00"))

    def test_invoice_without_a_promo_has_zero_promo_fields(self):
        order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=2,
        )
        OrderItem.objects.create(
            order=order, product=self.jerky, quantity=Decimal("2.00")
        )

        invoice = issue_invoice(order)
        line = invoice.line_items.get()

        self.assertEqual(invoice.promo_discount_amount, Decimal("0.00"))
        self.assertEqual(invoice.promo_label, "")
        self.assertEqual(invoice.total_amount, Decimal("12.00"))
        self.assertEqual(line.free_quantity, Decimal("0.00"))
        self.assertEqual(line.promo_discount, Decimal("0.00"))
        self.assertEqual(line.net_line_total, Decimal("12.00"))

    def test_promo_is_frozen_against_later_flag_changes(self):
        invoice = issue_invoice(self.order)
        Product.objects.filter(pk=self.jerky.pk).update(promo_group="", active=False)

        invoice.refresh_from_db()
        self.assertEqual(invoice.promo_discount_amount, Decimal("6.00"))
        self.assertEqual(invoice.promo_label, "Jerky 5+1")
        self.assertEqual(invoice.line_items.get().promo_discount, Decimal("6.00"))

    def test_promo_sits_outside_the_vat_base(self):
        """VAT is computed on gross line values, exactly like the coupon discount."""
        vatted = Product.objects.create(
            name="Spicy Jerky (VAT)",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            vat=True,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=3,
            promo_discount=Decimal("6.00"),
        )
        OrderItem.objects.create(
            order=order,
            product=vatted,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )

        invoice = issue_invoice(order)
        line = invoice.line_items.get()

        self.assertEqual(line.vat_rate, Decimal("0.20"))
        # 6.00 gross -> 5.00 net, so 1.00 VAT per unit across all 6 gross units.
        self.assertEqual(line.vat_amount, Decimal("6.00"))
        self.assertEqual(invoice.vat_amount, Decimal("6.00"))
        self.assertEqual(invoice.promo_discount_amount, Decimal("6.00"))

    def test_promo_line_items_are_write_once(self):
        invoice = issue_invoice(self.order)
        line = invoice.line_items.get()

        line.promo_discount = Decimal("0.00")
        with self.assertRaises(ValidationError):
            line.save()


class CreditNotePromoCopyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="credit-promo@example.com",
            password="SecurePass123!",
            first_name="Credit",
            surname="Promo",
            is_email_verified=True,
        )
        self.jerky = Product.objects.create(
            name="Beef Jerky",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="paid",
            delivery_date=timezone.localdate(),
            delivery_date_order_id=1,
            promo_discount=Decimal("12.00"),
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("12.00"),
            free_quantity=Decimal("2.00"),
        )
        self.invoice = issue_invoice(self.order)

    def test_credit_note_copies_the_promo_snapshot(self):
        note = credit(self.invoice)

        self.assertEqual(note.promo_discount_amount, Decimal("12.00"))
        self.assertEqual(note.promo_label, "Jerky 5+1")
        self.assertEqual(note.total_amount, self.invoice.total_amount)
        self.assertEqual(note.total_amount, Decimal("60.00"))

    def test_credit_note_line_items_copy_the_free_units(self):
        note = credit(self.invoice)
        line = note.line_items.get()
        invoice_line = self.invoice.line_items.get()

        self.assertEqual(line.quantity, Decimal("12.00"))
        self.assertEqual(line.line_total, Decimal("72.00"))
        self.assertEqual(line.free_quantity, Decimal("2.00"))
        self.assertEqual(line.promo_discount, Decimal("12.00"))
        self.assertEqual(line.net_line_total, Decimal("60.00"))
        self.assertEqual(line.free_quantity, invoice_line.free_quantity)
        self.assertEqual(line.promo_discount, invoice_line.promo_discount)

    def test_credit_note_promo_line_items_are_immutable(self):
        note = credit(self.invoice)
        line = note.line_items.get()

        line.promo_discount = Decimal("0.00")
        with self.assertRaises(ValidationError):
            line.save()
