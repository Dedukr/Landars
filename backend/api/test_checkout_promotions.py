"""
Checkout coverage for the automatic Jerky 5+1 promotion.

The promo is money, so it is derived server-side from the locked cart exactly
like the coupon discount: these tests pin the frozen ``Order.promo_discount``,
the per-line ``free_quantity`` attribution, the resulting ``total_price``, the
Stripe PaymentIntent amount parity, coupon stacking, and the fact that nothing
in the request body can change any of it.
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from api.checkout_security import money_to_pence
from api.models import Cart, Order, Product

User = get_user_model()

SHIPPING_METHOD_ID = 8

ADDRESS = {
    "address_line": "1 Jerky Lane",
    "address_line2": "",
    "city": "London",
    "postal_code": "SW1A 1AA",
    "country": "GB",
}


class JerkyCheckoutTestCase(TestCase):
    """Shared fixture: a post-delivery cart holding 6 jerky at 6.00 each."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="jerky-checkout@example.com",
            password="SecurePass123!",
            first_name="Jerky",
            surname="Buyer",
            is_email_verified=True,
        )
        self.client.force_authenticate(self.user)

        self.jerky = Product.objects.create(
            name="Beef Jerky",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        self.teriyaki = Product.objects.create(
            name="Teriyaki Jerky",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        self.cart = Cart.objects.create(user=self.user, is_home_delivery=False)

    def checkout(self, **extra_data):
        """POST the checkout with a stubbed Sendcloud re-quote (fee 0.00)."""
        payload = {
            "first_name": "Jerky",
            "surname": "Buyer",
            "phone": "+447700900123",
            "shipping_method_id": SHIPPING_METHOD_ID,
            "address": dict(ADDRESS),
            "bill_use_delivery_address": True,
        }
        payload.update(extra_data)

        with patch(
            "api.checkout_security.resolve_post_delivery_fee",
            return_value=Decimal("0.00"),
        ):
            return self.client.post(reverse("order-list"), payload, format="json")


class CheckoutPromoAttributionTests(JerkyCheckoutTestCase):
    def test_six_jerky_freeze_promo_and_free_units_on_the_order(self):
        self.cart.items.create(product=self.jerky, quantity=6)

        resp = self.checkout()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.sum_price, Decimal("36.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))
        self.assertEqual(order.promo_free_units, 1)
        self.assertEqual(order.promo_label, "Jerky 5+1")

        item = order.items.get(product=self.jerky)
        self.assertEqual(item.quantity, Decimal("6.00"))
        self.assertEqual(item.free_quantity, Decimal("1.00"))
        self.assertEqual(item.get_total_price(), Decimal("36.00"))
        self.assertEqual(item.get_promo_discount(), Decimal("6.00"))
        self.assertEqual(item.get_net_total_price(), Decimal("30.00"))

    def test_five_jerky_earn_nothing(self):
        self.cart.items.create(product=self.jerky, quantity=5)

        resp = self.checkout()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.promo_discount, Decimal("0.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))
        self.assertEqual(order.promo_free_units, 0)
        self.assertEqual(order.promo_label, "")
        self.assertEqual(
            order.items.get(product=self.jerky).free_quantity, Decimal("0.00")
        )

    def test_mixed_flavours_attribute_the_free_unit_to_the_lowest_product_id(self):
        self.cart.items.create(product=self.teriyaki, quantity=3)
        self.cart.items.create(product=self.jerky, quantity=3)

        resp = self.checkout()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.promo_free_units, 1)
        # Equal prices tie-break on ascending product id: self.jerky was created first.
        self.assertEqual(
            order.items.get(product=self.jerky).free_quantity, Decimal("1.00")
        )
        self.assertEqual(
            order.items.get(product=self.teriyaki).free_quantity, Decimal("0.00")
        )

    def test_twelve_jerky_earn_two_free_units(self):
        self.cart.items.create(product=self.jerky, quantity=12)

        resp = self.checkout()
        order = Order.objects.get(pk=resp.data["id"])

        self.assertEqual(order.promo_discount, Decimal("12.00"))
        self.assertEqual(order.total_price, Decimal("60.00"))
        self.assertEqual(
            order.items.get(product=self.jerky).free_quantity, Decimal("2.00")
        )

    def test_promo_stacks_with_the_save10_coupon(self):
        """6 jerky = 36.00 subtotal - 6.00 promo - 3.60 coupon = 26.40."""
        self.cart.items.create(product=self.jerky, quantity=6)

        resp = self.checkout(coupon_code="save10")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.sum_price, Decimal("36.00"))
        # The coupon keeps its pre-promo basis (cart.sum_price).
        self.assertEqual(order.discount, Decimal("3.60"))
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.delivery_fee, Decimal("0.00"))
        self.assertEqual(order.total_price, Decimal("26.40"))


class CheckoutPromoTamperTests(JerkyCheckoutTestCase):
    """The promo is derived server-side; the client cannot influence it."""

    def test_client_supplied_promo_discount_is_ignored(self):
        self.cart.items.create(product=self.jerky, quantity=6)

        resp = self.checkout(
            promo_discount="0.00",
            promo_label="Nope",
            promo_free_units=0,
            total_price="1.00",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))

    def test_client_cannot_inflate_the_promo(self):
        self.cart.items.create(product=self.jerky, quantity=5)

        resp = self.checkout(promo_discount="999.00", free_quantity="5")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.promo_discount, Decimal("0.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))
        self.assertEqual(
            order.items.get(product=self.jerky).free_quantity, Decimal("0.00")
        )

    def test_client_cannot_flag_a_non_promo_product_at_checkout(self):
        crisps = Product.objects.create(
            name="Crisps",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
        )
        self.cart.items.create(product=crisps, quantity=6)

        resp = self.checkout(promo_group=Product.PromoGroup.JERKY_5_1)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.promo_discount, Decimal("0.00"))
        self.assertEqual(order.total_price, Decimal("36.00"))
        crisps.refresh_from_db()
        self.assertEqual(crisps.promo_group, "")

    def test_client_supplied_discount_still_requires_a_valid_coupon(self):
        self.cart.items.create(product=self.jerky, quantity=6)

        resp = self.checkout(discount="30.00", coupon_code="evil")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.discount, Decimal("0.00"))
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))


class CheckoutPromoPaymentAmountTests(JerkyCheckoutTestCase):
    """The Stripe amount and the verified order total must agree exactly."""

    @patch("api.payments.stripe.PaymentIntent.create")
    def test_payment_intent_amount_uses_the_discounted_cart_total(self, create):
        self.cart.items.create(product=self.jerky, quantity=6)

        intent = MagicMock()
        intent.id = "pi_promo_test"
        intent.client_secret = "pi_promo_test_secret"
        create.return_value = intent

        resp = self.client.post(reverse("create_payment_intent"), {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        amount_pence = create.call_args.kwargs["amount"]
        self.assertEqual(amount_pence, money_to_pence(Decimal("30.00")))
        self.assertEqual(amount_pence, resp.data["amount"])
        self.assertEqual(amount_pence, money_to_pence(self.cart.total_price))

    @patch("api.checkout_security.stripe.PaymentIntent.retrieve")
    @patch("api.payments.stripe.PaymentIntent.create")
    def test_promo_order_is_paid_when_the_intent_matches_the_order_total(
        self, create, retrieve
    ):
        self.cart.items.create(product=self.jerky, quantity=6)

        created_intent = MagicMock()
        created_intent.id = "pi_promo_paid"
        created_intent.client_secret = "pi_promo_paid_secret"
        create.return_value = created_intent

        intent_resp = self.client.post(
            reverse("create_payment_intent"), {}, format="json"
        )
        amount_pence = intent_resp.data["amount"]

        retrieved = MagicMock()
        retrieved.status = "succeeded"
        retrieved.amount = amount_pence
        retrieved.currency = "gbp"
        retrieved.metadata = {"user_id": str(self.user.id)}
        retrieve.return_value = retrieved

        resp = self.checkout(payment_intent_id="pi_promo_paid")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(order.status, "paid")
        self.assertEqual(order.payment_status, "succeeded")
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(money_to_pence(order.total_price), amount_pence)

    @patch("api.checkout_security.stripe.PaymentIntent.retrieve")
    def test_paying_the_pre_promo_total_is_rejected(self, retrieve):
        """Paying 36.00 for a 30.00 order must not create an order."""
        self.cart.items.create(product=self.jerky, quantity=6)

        retrieved = MagicMock()
        retrieved.status = "succeeded"
        retrieved.amount = money_to_pence(Decimal("36.00"))
        retrieved.currency = "gbp"
        retrieved.metadata = {"user_id": str(self.user.id)}
        retrieve.return_value = retrieved

        resp = self.checkout(payment_intent_id="pi_wrong_amount")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())
        self.assertTrue(Cart.objects.filter(pk=self.cart.pk).exists())


class CartApiPromoTests(JerkyCheckoutTestCase):
    """The cart API exposes the promo as read-only derived money."""

    def test_cart_payload_reports_the_promo(self):
        self.cart.items.create(product=self.jerky, quantity=6)

        resp = self.client.get(reverse("cart"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["promo_discount"], "6.00")
        self.assertEqual(resp.data["promo_free_units"], 1)
        self.assertEqual(resp.data["promo_eligible_quantity"], 6)
        self.assertEqual(resp.data["promo_label"], "Jerky 5+1")
        self.assertEqual(resp.data["sum_price"], "36.00")

    def test_cart_nudges_towards_the_next_free_unit(self):
        self.cart.items.create(product=self.jerky, quantity=4)

        resp = self.client.get(reverse("cart"))
        self.assertEqual(resp.data["promo_discount"], "0.00")
        self.assertEqual(resp.data["promo_units_to_next_free"], 2)
        self.assertEqual(resp.data["promo_label"], "")

    def test_client_cannot_write_a_promo_discount_onto_the_cart(self):
        self.cart.items.create(product=self.jerky, quantity=6)

        resp = self.client.put(
            reverse("cart"),
            {"promo_discount": "0.00", "notes": "please hurry"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # The written value is ignored: the promo is recomputed from the lines.
        self.assertEqual(resp.data["promo_discount"], "6.00")
        self.assertEqual(
            Cart.objects.get(pk=self.cart.pk).promo_discount, Decimal("6.00")
        )
