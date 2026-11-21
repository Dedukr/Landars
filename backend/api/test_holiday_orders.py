"""
Holiday (Christmas / New Year) website orders.

The customer only picks the occasion; the server adds the event's rate (15%) on
the items subtotal, refuses it for parcel (post) carts and for switched-off
events, and freezes the rate onto the order (``Order.holiday_fee``).
"""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from api.models import Cart, HolidayEvent, Order, Product, ProductCategory
from api.services.holidays import UNAVAILABLE_CODE
from notifications.services.telegram_formatting import format_order_for_telegram

User = get_user_model()

ADDRESS = {
    "address_line": "1 Holly Lane",
    "address_line2": "",
    "city": "London",
    "postal_code": "SW1A 1AA",
    "country": "GB",
}

POST_CHECK = "api.services.post_delivery_categories.product_has_post_delivery_category"


@override_settings(JERKY_PROMO_CATEGORY_ID=0, JERKY_PROMO_CATEGORY_NAME="Jerky")
class HolidayTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="holiday@example.com",
            password="SecurePass123!",
            first_name="Holly",
            surname="Berry",
            is_email_verified=True,
        )
        self.client.force_authenticate(self.user)
        # The seed migration creates both events switched off.
        self.christmas = HolidayEvent.objects.get(theme=HolidayEvent.Theme.CHRISTMAS)
        self.christmas.active = True
        self.christmas.save()
        self.new_year = HolidayEvent.objects.get(theme=HolidayEvent.Theme.NEW_YEAR)

        self.pierogi = Product.objects.create(
            name="Pierogi", base_price=Decimal("10.00"), holiday_fee=Decimal("0")
        )
        self.cart = Cart.objects.create(user=self.user, is_home_delivery=True)

    def put_cart(self, payload):
        return self.client.put(reverse("cart"), payload, format="json")

    def checkout(self, **extra):
        payload = {
            "first_name": "Holly",
            "surname": "Berry",
            "phone": "+447700900123",
            "address": dict(ADDRESS),
            "bill_use_delivery_address": True,
        }
        payload.update(extra)
        return self.client.post(reverse("order-list"), payload, format="json")


class HolidayEventListTests(HolidayTestCase):
    def test_lists_only_active_events(self):
        resp = self.client.get(reverse("holiday-event-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual([e["theme"] for e in resp.data], ["christmas"])
        self.assertEqual(resp.data[0]["surcharge_percent"], "15")
        self.assertEqual(resp.data[0]["label"], "🎄 Christmas")

    def test_switching_an_event_refreshes_the_cached_list(self):
        self.client.get(reverse("holiday-event-list"))
        self.new_year.active = True
        self.new_year.save()
        resp = self.client.get(reverse("holiday-event-list"))
        self.assertEqual(len(resp.data), 2)


class HolidayCartTests(HolidayTestCase):
    def test_choosing_christmas_adds_fifteen_percent(self):
        self.cart.items.create(product=self.pierogi, quantity=4)  # 40.00

        resp = self.put_cart({"holiday_event": self.christmas.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["holiday_event"]["id"], self.christmas.id)
        self.assertTrue(resp.data["holiday_event_open"])
        self.assertEqual(resp.data["holiday_fee_percent"], "15")
        self.assertEqual(resp.data["holiday_fee_amount"], "6.00")
        # 40 + 6 holiday + 0 delivery (cart fee not recalculated here)
        self.assertEqual(Decimal(resp.data["total_price"]), Decimal("46.00"))

    def test_clearing_the_occasion_returns_to_regular(self):
        self.cart.items.create(product=self.pierogi, quantity=1)
        self.put_cart({"holiday_event": self.christmas.id})

        resp = self.put_cart({"holiday_event": None})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data["holiday_event"])
        self.assertEqual(resp.data["holiday_fee_amount"], "0.00")

    def test_switched_off_event_is_refused(self):
        resp = self.put_cart({"holiday_event": self.new_year.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], UNAVAILABLE_CODE)
        self.cart.refresh_from_db()
        self.assertIsNone(self.cart.holiday_event)

    def test_parcel_cart_is_refused(self):
        self.cart.is_home_delivery = False
        self.cart.save()
        resp = self.put_cart({"holiday_event": self.christmas.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], UNAVAILABLE_CODE)

    def test_cart_turning_into_a_parcel_order_drops_the_occasion(self):
        self.cart.holiday_event = self.christmas
        self.cart.save()
        sausage = Product.objects.create(
            name="Sausage", base_price=Decimal("8.00"), holiday_fee=Decimal("0")
        )
        with patch(POST_CHECK, return_value=True), patch(
            "shipping.sendcloud_shipping.ShippingService.get_delivery_fee_by_weight",
            return_value=Decimal("5.00"),
        ):
            resp = self.client.post(
                reverse("cart"), {"product_id": sausage.id, "quantity": 1}, format="json"
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.cart.refresh_from_db()
        self.assertFalse(self.cart.is_home_delivery)
        self.assertIsNone(self.cart.holiday_event)


class HolidayCheckoutTests(HolidayTestCase):
    def test_order_freezes_rate_and_matches_cart_total(self):
        self.cart.items.create(product=self.pierogi, quantity=4)  # 40.00
        cart_resp = self.put_cart(
            {"holiday_event": self.christmas.id, "recalculate_delivery": True}
        )
        cart_total = Decimal(cart_resp.data["total_price"])

        resp = self.checkout()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.holiday_event, self.christmas)
        self.assertEqual(order.holiday_fee, Decimal("15"))
        self.assertIsNone(order.delivery_date)  # the admin assigns the day
        # 40 + 6 holiday + 10 home delivery
        self.assertEqual(order.total_price, Decimal("56.00"))
        self.assertEqual(order.total_price, cart_total)
        self.assertEqual(resp.data["holiday_event"]["theme"], "christmas")
        self.assertEqual(resp.data["holiday_fee_amount"], "6.00")

    def test_rate_stacks_with_coupon_and_jerky_promo(self):
        jerky_category = ProductCategory.objects.create(name="Jerky")
        jerky = Product.objects.create(
            name="Beef Jerky", base_price=Decimal("6.00"), holiday_fee=Decimal("0")
        )
        jerky.categories.add(jerky_category)
        self.cart.items.create(product=jerky, quantity=6)  # 36.00, 1 free (6.00)
        self.cart.items.create(product=self.pierogi, quantity=6)  # 60.00
        self.put_cart({"holiday_event": self.christmas.id})

        resp = self.checkout(coupon_code="save10")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.sum_price, Decimal("96.00"))
        self.assertEqual(order.holiday_fee_amount, Decimal("14.40"))
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.discount, Decimal("9.60"))
        # 96 + 14.40 holiday + 10 delivery - 9.60 coupon - 6 promo
        self.assertEqual(order.total_price, Decimal("104.80"))

    def test_regular_order_has_no_rate(self):
        self.cart.items.create(product=self.pierogi, quantity=1)
        resp = self.checkout()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        order = Order.objects.get(pk=resp.data["id"])
        self.assertIsNone(order.holiday_event)
        self.assertEqual(order.holiday_fee, Decimal("0"))
        self.assertIsNone(resp.data["holiday_event"])

    def test_event_switched_off_before_checkout_is_refused(self):
        self.cart.items.create(product=self.pierogi, quantity=1)
        self.put_cart({"holiday_event": self.christmas.id})
        self.christmas.active = False
        self.christmas.save()

        resp = self.checkout()
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["code"], UNAVAILABLE_CODE)
        self.assertFalse(Order.objects.filter(customer=self.user).exists())

    def test_telegram_message_flags_holiday_orders(self):
        self.cart.items.create(product=self.pierogi, quantity=4)
        self.put_cart({"holiday_event": self.christmas.id})
        resp = self.checkout()
        order = Order.objects.get(pk=resp.data["id"])

        text = format_order_for_telegram(order)
        self.assertTrue(text.startswith("🎄 <b>CHRISTMAS ORDER</b>"))
        self.assertIn("<b>Holiday fee (15%):</b> £6.00", text)
        self.assertIn("Delivered 22–24 December", text)
