"""Tests for checkout pricing / payment trust boundaries and product write ACL."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from api.checkout_security import (
    apply_coupon_to_cart,
    discount_for_coupon,
    money_to_pence,
    verify_stripe_payment_for_checkout,
)
from api.models import Cart, Product

User = get_user_model()


class CheckoutSecurityHelpersTests(TestCase):
    def test_save10_discount_is_ten_percent(self):
        self.assertEqual(
            discount_for_coupon(Decimal("100.00"), "save10"),
            Decimal("10.00"),
        )
        self.assertEqual(
            discount_for_coupon(Decimal("100.00"), "SAVE10"),
            Decimal("10.00"),
        )
        self.assertEqual(
            discount_for_coupon(Decimal("100.00"), "evil"),
            Decimal("0.00"),
        )

    def test_money_to_pence(self):
        self.assertEqual(money_to_pence(Decimal("12.34")), 1234)
        self.assertEqual(money_to_pence("10.005"), 1001)  # HALF_UP

    def test_apply_coupon_to_cart(self):
        user = User.objects.create_user(
            email="c@example.com",
            password="SecurePass123!",
            first_name="C",
            surname="User",
            is_email_verified=True,
        )
        cart = Cart.objects.create(user=user)
        product = Product.objects.create(
            name="Test",
            base_price=Decimal("50.00"),
            holiday_fee=Decimal("0"),
            active=True,
        )
        cart.items.create(product=product, quantity=2)

        amount, err = apply_coupon_to_cart(cart, "save10")
        self.assertIsNone(err)
        self.assertEqual(amount, Decimal("10.00"))

        amount, err = apply_coupon_to_cart(cart, "nope")
        self.assertEqual(err, "Invalid coupon code")

        amount, err = apply_coupon_to_cart(cart, "")
        self.assertIsNone(err)
        self.assertEqual(amount, Decimal("0.00"))


class VerifyStripePaymentTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="pay@example.com",
            password="SecurePass123!",
            first_name="Pay",
            surname="User",
            is_email_verified=True,
        )

    @patch("api.checkout_security.stripe.PaymentIntent.retrieve")
    def test_accepts_matching_succeeded_intent(self, retrieve):
        intent = MagicMock()
        intent.status = "succeeded"
        intent.amount = 2500
        intent.currency = "gbp"
        intent.metadata = {"user_id": str(self.user.id)}
        retrieve.return_value = intent

        ok, err = verify_stripe_payment_for_checkout(
            payment_intent_id="pi_test",
            user=self.user,
            expected_total=Decimal("25.00"),
        )
        self.assertTrue(ok)
        self.assertIsNone(err)

    @patch("api.checkout_security.stripe.PaymentIntent.retrieve")
    def test_rejects_amount_mismatch(self, retrieve):
        intent = MagicMock()
        intent.status = "succeeded"
        intent.amount = 100
        intent.currency = "gbp"
        intent.metadata = {"user_id": str(self.user.id)}
        retrieve.return_value = intent

        ok, err = verify_stripe_payment_for_checkout(
            payment_intent_id="pi_test",
            user=self.user,
            expected_total=Decimal("25.00"),
        )
        self.assertFalse(ok)
        self.assertIn("amount", (err or "").lower())

    @patch("api.checkout_security.stripe.PaymentIntent.retrieve")
    def test_rejects_other_user_metadata(self, retrieve):
        intent = MagicMock()
        intent.status = "succeeded"
        intent.amount = 2500
        intent.currency = "gbp"
        intent.metadata = {"user_id": "99999"}
        retrieve.return_value = intent

        ok, err = verify_stripe_payment_for_checkout(
            payment_intent_id="pi_test",
            user=self.user,
            expected_total=Decimal("25.00"),
        )
        self.assertFalse(ok)
        self.assertIn("belong", (err or "").lower())


@override_settings(
    # Avoid accidental side effects
)
class ProductWritePermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product = Product.objects.create(
            name="Locked",
            base_price=Decimal("5.00"),
            holiday_fee=Decimal("0"),
            active=True,
        )
        self.user = User.objects.create_user(
            email="buyer@example.com",
            password="SecurePass123!",
            first_name="B",
            surname="Uyer",
            is_email_verified=True,
        )
        self.staff = User.objects.create_user(
            email="staff@example.com",
            password="SecurePass123!",
            first_name="S",
            surname="Taff",
            is_email_verified=True,
            is_staff=True,
        )

    def test_anonymous_can_get_but_not_post(self):
        list_url = reverse("product-list")
        self.assertEqual(self.client.get(list_url).status_code, status.HTTP_200_OK)
        denied = self.client.post(
            list_url,
            {"name": "Hack", "base_price": "1.00"},
            format="json",
        )
        self.assertIn(
            denied.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_customer_cannot_patch_product(self):
        self.client.force_authenticate(self.user)
        url = reverse("product-detail", kwargs={"product_id": self.product.id})
        resp = self.client.patch(url, {"name": "Nope"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_patch_product(self):
        self.client.force_authenticate(self.staff)
        url = reverse("product-detail", kwargs={"product_id": self.product.id})
        resp = self.client.patch(url, {"name": "Ok"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, "Ok")


class CartPricingTrustTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="cart@example.com",
            password="SecurePass123!",
            first_name="Cart",
            surname="User",
            is_email_verified=True,
        )
        self.cart = Cart.objects.create(user=self.user)
        product = Product.objects.create(
            name="Item",
            base_price=Decimal("20.00"),
            holiday_fee=Decimal("0"),
            active=True,
        )
        self.cart.items.create(product=product, quantity=1)
        self.client.force_authenticate(self.user)

    def test_rejects_raw_discount(self):
        resp = self.client.put(
            reverse("cart"),
            {"discount": "999"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_coupon_code_applies_server_discount(self):
        resp = self.client.put(
            reverse("cart"),
            {"coupon_code": "save10"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.cart.refresh_from_db()
        self.assertEqual(self.cart.discount, Decimal("2.00"))
