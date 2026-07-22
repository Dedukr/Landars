from decimal import Decimal

from django.test import SimpleTestCase

from festival.services.pricing import price_line, price_order


class PricingTests(SimpleTestCase):
    def test_zero_vat(self):
        line = price_line(
            product_id=1,
            product_name="A",
            quantity=2,
            unit_gross=Decimal("8.50"),
            vat_rate_percent=Decimal("0"),
        )
        self.assertEqual(line.line_total, Decimal("17.00"))
        self.assertEqual(line.line_net, Decimal("17.00"))
        self.assertEqual(line.line_vat, Decimal("0.00"))

    def test_five_percent_vat(self):
        line = price_line(
            product_id=1,
            product_name="A",
            quantity=1,
            unit_gross=Decimal("10.50"),
            vat_rate_percent=Decimal("5"),
        )
        self.assertEqual(line.line_total, Decimal("10.50"))
        self.assertEqual(line.line_net, Decimal("10.00"))
        self.assertEqual(line.line_vat, Decimal("0.50"))

    def test_twenty_percent_vat(self):
        line = price_line(
            product_id=1,
            product_name="A",
            quantity=1,
            unit_gross=Decimal("12.00"),
            vat_rate_percent=Decimal("20"),
        )
        self.assertEqual(line.line_total, Decimal("12.00"))
        self.assertEqual(line.line_net, Decimal("10.00"))
        self.assertEqual(line.line_vat, Decimal("2.00"))

    def test_mixed_rates_and_quantities(self):
        lines = [
            price_line(
                product_id=1,
                product_name="A",
                quantity=2,
                unit_gross=Decimal("8.50"),
                vat_rate_percent=Decimal("0"),
            ),
            price_line(
                product_id=2,
                product_name="B",
                quantity=3,
                unit_gross=Decimal("6.00"),
                vat_rate_percent=Decimal("20"),
            ),
        ]
        priced = price_order(lines)
        self.assertEqual(priced.total_gross, Decimal("35.00"))
        self.assertEqual(priced.vat_breakdown["0"]["gross"], "17.00")
        self.assertEqual(priced.vat_breakdown["20"]["vat"], "3.00")

    def test_fractional_rounding_half_up(self):
        line = price_line(
            product_id=1,
            product_name="A",
            quantity=1,
            unit_gross=Decimal("1.01"),
            vat_rate_percent=Decimal("20"),
        )
        # 1.01 / 1.2 = 0.84166... -> 0.84 net, 0.17 vat
        self.assertEqual(line.line_net, Decimal("0.84"))
        self.assertEqual(line.line_vat, Decimal("0.17"))
        self.assertEqual(line.line_net + line.line_vat, line.line_total)
