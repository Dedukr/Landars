from account.models import Address, BillingAddress, CustomUser, Profile
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

User = get_user_model()


class OrderCustomerBillingAdminTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            name="Admin Billing",
            email="admin-billing@example.com",
            password="pass",
        )
        self.client.force_login(self.admin)
        self.customer = CustomUser.objects.create_user(
            email="customer-billing@example.com",
            password="pass",
            first_name="Jane",
            surname="Doe",
        )
        delivery = Address.objects.create(
            address_line="10 Delivery Rd",
            address_line2="",
            city="London",
            postal_code="SW1A 1AA",
        )
        billing = BillingAddress.objects.create(
            customer=self.customer,
            company_name="Acme Ltd",
            contact_name="Jane Doe",
            address_line="1 Billing St",
            address_line2="Suite 2",
            city="Manchester",
            postal_code="M1 1AE",
        )
        Profile.objects.update_or_create(
            user=self.customer,
            defaults={
                "address": delivery,
                "billing_address": billing,
                "bill_use_delivery_address": False,
            },
        )

    def test_customer_billing_json_returns_saved_billing(self):
        url = reverse(
            "admin:api_order_customer_billing",
            args=[self.customer.pk],
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["bill_use_delivery_address"])
        self.assertEqual(data["company_name"], "Acme Ltd")
        self.assertEqual(data["contact_name"], "Jane Doe")
        self.assertEqual(data["address_line"], "1 Billing St")
        self.assertEqual(data["address_line2"], "Suite 2")
        self.assertEqual(data["city"], "Manchester")
        self.assertEqual(data["postal_code"], "M1 1AE")

    def test_customer_billing_json_uses_delivery_when_flag_set(self):
        profile = self.customer.profile
        profile.bill_use_delivery_address = True
        profile.save(update_fields=["bill_use_delivery_address"])

        url = reverse(
            "admin:api_order_customer_billing",
            args=[self.customer.pk],
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["bill_use_delivery_address"])
        self.assertEqual(data["company_name"], "Acme Ltd")
        self.assertEqual(data["address_line"], "10 Delivery Rd")
        self.assertEqual(data["city"], "London")
        self.assertEqual(data["postal_code"], "SW1A 1AA")

    def test_customer_billing_json_404_for_missing_customer(self):
        url = reverse("admin:api_order_customer_billing", args=[999999])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)

    def test_order_add_page_includes_billing_prefetch_script(self):
        url = reverse("admin:api_order_add")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn("ORDER_CUSTOMER_BILLING_URL_TEMPLATE", content)
        self.assertIn("customer-billing", content)
        self.assertIn("fetchBilling", content)

    def test_order_change_page_includes_billing_prefetch_script(self):
        from api.models import Order

        order = Order.objects.create(
            customer=self.customer,
            status="pending",
            bill_use_delivery_address=True,
        )
        url = reverse("admin:api_order_change", args=[order.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn("ORDER_CUSTOMER_BILLING_URL_TEMPLATE", content)
        self.assertIn("fetchBilling", content)
        self.assertIn("select2:select", content)
