from account.models import Address, BillingAddress, CustomUser, Profile
from django.test import TestCase

from api.models import Order
from api.services.order_address_snapshot import (
    freeze_order_addresses_from_customer,
    order_has_frozen_delivery,
    release_order_address_freeze,
    sync_order_address_freeze_for_status,
)
from api.services.product_sales import set_order_status


class OrderAddressFreezePolicyTests(TestCase):
    def setUp(self):
        self.customer = CustomUser.objects.create_user(
            email="freeze-addr@example.com",
            password="pass",
            first_name="Alex",
            surname="Nova",
        )
        self.delivery = Address.objects.create(
            address_line="10 Delivery Rd",
            address_line2="Flat 1",
            city="London",
            postal_code="SW1A 1AA",
        )
        self.billing = BillingAddress.objects.create(
            customer=self.customer,
            company_name="Acme Ltd",
            contact_name="Alex Nova",
            address_line="1 Billing St",
            address_line2="Suite 2",
            city="Manchester",
            postal_code="M1 1AE",
        )
        Profile.objects.update_or_create(
            user=self.customer,
            defaults={
                "address": self.delivery,
                "billing_address": self.billing,
                "bill_use_delivery_address": True,
            },
        )

    def test_pending_order_follows_live_customer_address(self):
        order = Order.objects.create(
            customer=self.customer,
            status="pending",
            bill_use_delivery_address=True,
        )
        sync_order_address_freeze_for_status(order)
        order.refresh_from_db()

        self.assertIsNone(order.address_id)
        self.assertEqual(order.get_delivery_address().address_line, "10 Delivery Rd")

        Address.objects.filter(pk=self.delivery.pk).update(address_line="99 New Street")
        order = Order.objects.select_related("customer__profile__address").get(
            pk=order.pk
        )
        self.assertEqual(order.get_delivery_address().address_line, "99 New Street")

    def test_paid_freezes_order_address(self):
        order = Order.objects.create(
            customer=self.customer,
            status="pending",
            bill_use_delivery_address=True,
        )
        set_order_status(order, "paid")
        order.refresh_from_db()

        self.assertTrue(order_has_frozen_delivery(order))
        self.assertEqual(order.address.address_line, "10 Delivery Rd")

        self.delivery.address_line = "Changed After Paid"
        self.delivery.save(update_fields=["address_line"])
        order.refresh_from_db()
        self.assertEqual(order.address.address_line, "10 Delivery Rd")

    def test_issued_releases_freeze(self):
        order = Order.objects.create(
            customer=self.customer,
            status="pending",
            bill_use_delivery_address=True,
        )
        set_order_status(order, "paid")
        order.refresh_from_db()
        self.assertTrue(order_has_frozen_delivery(order))

        set_order_status(order, "issued")
        order.refresh_from_db()

        self.assertIsNone(order.address_id)
        self.delivery.address_line = "After Issue"
        self.delivery.save(update_fields=["address_line"])
        self.assertEqual(order.get_delivery_address().address_line, "After Issue")

    def test_ready_to_ship_and_cancelled_freeze(self):
        order = Order.objects.create(
            customer=self.customer,
            status="issued",
            bill_use_delivery_address=True,
        )
        set_order_status(order, "ready_to_ship")
        order.refresh_from_db()
        self.assertTrue(order_has_frozen_delivery(order))

        set_order_status(order, "issued")
        order.refresh_from_db()
        self.assertIsNone(order.address_id)

        set_order_status(order, "cancelled")
        order.refresh_from_db()
        self.assertTrue(order_has_frozen_delivery(order))

    def test_freezes_separate_billing_address_copy(self):
        profile = self.customer.profile
        profile.bill_use_delivery_address = False
        profile.save(update_fields=["bill_use_delivery_address"])

        order = Order.objects.create(
            customer=self.customer,
            status="pending",
            bill_use_delivery_address=False,
        )
        freeze_order_addresses_from_customer(order)
        order.refresh_from_db()

        self.assertIsNotNone(order.billing_address_id)
        self.assertNotEqual(order.billing_address_id, self.billing.pk)
        self.assertEqual(order.billing_address.address_line, "1 Billing St")

        self.billing.address_line = "Changed Billing"
        self.billing.save(update_fields=["address_line"])
        order.refresh_from_db()
        self.assertEqual(order.billing_address.address_line, "1 Billing St")

    def test_release_clears_owned_address(self):
        order = Order.objects.create(
            customer=self.customer,
            status="paid",
            bill_use_delivery_address=True,
        )
        freeze_order_addresses_from_customer(order)
        order.refresh_from_db()
        self.assertIsNotNone(order.address_id)

        release_order_address_freeze(order)
        order.refresh_from_db()
        self.assertIsNone(order.address_id)
        self.assertEqual(order.get_delivery_address().pk, self.delivery.pk)
