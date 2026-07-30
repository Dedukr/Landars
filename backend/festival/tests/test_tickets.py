from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from festival.services.tickets import (
    encode_print_payload,
    render_customer_ticket,
    render_customer_ticket_markup,
    render_kitchen_ticket,
    render_kitchen_ticket_markup,
    strip_markup_tags,
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
        self.assertIn("   + Sparkling water", text)
        self.assertIn("1 x Jerky (Beef)", text)
        self.assertIn("1 x Deep Fried Pelmeni\n   + Sparkling water", text)
        self.assertEqual(text.count("TICKET 2"), 1)
        self.assertTrue(text.rstrip().endswith("=" * 42))
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
        self.assertIn("   + Sparkling water", text)
        self.assertEqual(text.count("TICKET 2"), 1)
        # Date left, REF right; business block centered.
        date_ref_lines = [
            line for line in text.splitlines() if "REF 2" in line
        ]
        self.assertEqual(len(date_ref_lines), 1)
        self.assertTrue(date_ref_lines[0].endswith("REF 2"))
        self.assertTrue(_center_landars(text))
        for line in text.splitlines():
            self.assertLessEqual(len(line), 42, msg=repr(line))

    def test_print_payload_encodes_pound_as_cp437(self):
        raw = encode_print_payload("TOTAL £8.50\n")
        self.assertEqual(raw, b"TOTAL \x9c8.50\n")
        self.assertNotIn(b"\xc2\xa3", raw)

    def test_markup_kitchen_has_centered_titles_and_left_body(self):
        order = self._order([_item(addition_name="Sparkling water")])
        text = render_kitchen_ticket_markup(order)
        # Titles are centered on their own line (no trailing align:left).
        self.assertIn(
            "[align: center][magnify: width 2; height 2]KITCHEN[plain]",
            text,
        )
        self.assertIn(
            "[align: center][magnify: width 2; height 2]TICKET 2[plain]",
            text,
        )
        self.assertNotIn("[plain][align: left]", text)
        self.assertIn("[cut]", text)
        self.assertRegex(
            text,
            r"\[align: center\]={48}\n\[align: left\]\n"
            r"\[align: center\]\[magnify: width 2; height 2\]TICKET 2\[plain\]\n"
            r"\[align: center\]-{48}\n\[align: left\]\n",
        )
        self.assertIn(
            "[align: left][column: vl; left ",
            text,
        )
        self.assertIn("right REF 2]", text)
        # Addition uses NBSP indent under left align.
        self.assertIn("[align: left]\u00a0\u00a0\u00a0+ Sparkling water", text)

    def test_markup_customer_layout(self):
        order = self._order(
            [_item(addition_name="Sparkling water", line_total=Decimal("9.99"))]
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
                total_gross=Decimal("9.99"),
                vat_breakdown={"0": {"net": "9.99", "vat": "0.00"}},
            ),
        ):
            text = render_customer_ticket_markup(order, invoice=None)
        self.assertIn(
            "[align: center][magnify: width 2; height 2]INVOICE[plain]",
            text,
        )
        self.assertIn(
            "[column: vl; left 1 x Deep Fried Pelmeni; right £9.99]",
            text,
        )
        self.assertIn("[column: vl; left TOTAL; right £9.99]", text)
        self.assertIn("right REF 2]", text)
        self.assertRegex(
            text,
            r"\[align: left\]\[column: vl; left \d{2}/\d{2}/\d{4} \d{2}:\d{2}; "
            r"right REF 2\]\n"
            r"\[align: center\]-{48}\n\[align: left\]\n",
        )
        # VAT section fully left — no right-column split for vat amount.
        self.assertIn("[align: left]VAT summary\n", text)
        self.assertIn("VAT 0% net £9.99 vat £0.00", text)
        self.assertNotIn("right vat ", text)
        # Business details centered (align on first content line, not a blank tag line).
        self.assertIn("[align: center]Landar's Food\n", text)
        self.assertIn("[align: center]VAT No 512363424", text)
        self.assertIn("£9.99", strip_markup_tags(text))


def _center_landars(text: str) -> bool:
    """True if Landar's Food appears as a centered padded line."""
    for line in text.splitlines():
        if "Landar's Food" in line and line.strip() == "Landar's Food":
            # Centered via spaces, not flush-left at column 0.
            return line.startswith(" ") and line.endswith(" ")
    return False
