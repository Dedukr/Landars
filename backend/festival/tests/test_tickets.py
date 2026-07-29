from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from festival.services.tickets import (
    render_customer_ticket,
    render_kitchen_ticket,
)


def _item(**kwargs):
    defaults = {
        "product_name": "Deep Fried Pelmeni",
        "filling_name": "",
        "addition_name": "",
        "quantity": 1,
        "line_total": Decimal("9.99"),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


@override_settings(FESTIVAL_TICKET_COLUMNS=42, FESTIVAL_VAT_REGISTERED=True)
class TicketLayoutTests(SimpleTestCase):
    def _order(self, items):
        order = SimpleNamespace(
            order_number=2,
            pk=2,
            created_at=mock.Mock(),
            items=SimpleNamespace(all=lambda: items),
        )
        order.created_at = __import__("django.utils.timezone", fromlist=["now"]).now()
        return order

    def test_kitchen_puts_addition_on_next_line_and_no_footer_ticket(self):
        order = self._order(
            [
                _item(addition_name="Sparkling water"),
                _item(product_name="Jerky", filling_name="Beef", line_total=Decimal("6")),
            ]
        )
        text = render_kitchen_ticket(order)
        self.assertIn("1 x Deep Fried Pelmeni", text)
        self.assertIn("        + Sparkling water", text)
        self.assertIn("1 x Jerky (Beef)", text)
        # Header ticket number remains; trailing footer line removed.
        self.assertEqual(text.count("TICKET 2"), 1)
        self.assertTrue(text.rstrip().endswith("=" * 42))
        # Date left, REF right on one line.
        date_ref_lines = [
            line for line in text.splitlines() if "REF 2" in line
        ]
        self.assertEqual(len(date_ref_lines), 1)
        self.assertRegex(date_ref_lines[0], r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}\s+REF 2$")
        self.assertTrue(date_ref_lines[0].endswith("REF 2"))
        self.assertEqual(len(date_ref_lines[0]), 42)
    def test_customer_shows_pound_and_keeps_total_on_one_line(self):
        order = self._order(
            [
                _item(addition_name="Sparkling water", line_total=Decimal("9.99")),
                _item(product_name="Jerky", filling_name="Beef", line_total=Decimal("6.00")),
                _item(product_name="Soft Drink", filling_name="Fanta", line_total=Decimal("2.00")),
            ]
        )
        with mock.patch(
            "festival.services.documents.seller_snapshot",
            return_value={
                "name": "Landar's Food",
                "address": "15 Flint Rise",
                "city": "Kent",
                "postal_code": "DA10 1DJ",
                "country": "United Kingdom",
                "vat_number": "512363424",
            },
        ), mock.patch(
            "festival.services.documents.pricing_from_order",
            return_value=SimpleNamespace(
                total_gross=Decimal("17.99"),
                vat_breakdown={"0": {"net": "17.99", "vat": "0.00"}},
            ),
        ):
            text = render_customer_ticket(order, invoice=None)

        self.assertIn("£9.99", text)
        self.assertIn("£17.99", text)
        total_lines = [line for line in text.splitlines() if line.startswith("TOTAL")]
        self.assertEqual(len(total_lines), 1)
        self.assertIn("£17.99", total_lines[0])
        self.assertLessEqual(len(total_lines[0]), 42)
        self.assertIn("        + Sparkling water", text)
        self.assertEqual(text.count("TICKET 2"), 1)
        for line in text.splitlines():
            self.assertLessEqual(len(line), 42, msg=repr(line))
