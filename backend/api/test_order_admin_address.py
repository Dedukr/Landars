from django.contrib.auth import get_user_model
from django.test import TestCase

from api.admin import OrderAdminForm
from api.models import Order

User = get_user_model()


class OrderAdminDeliveryAddressValidationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            name="Buyer", email="buyer@address.test", password="x"
        )

    def _form(self, **overrides):
        data = {
            "customer": self.user.pk,
            "status": "pending",
            "source": Order.Source.ADMIN,
            "payment_status": "pending",
            "notes": "",
            "delivery_date": "",
            "delivery_fee_manual": False,
            "delivery_fee": "0",
            "holiday_fee": "0",
            "discount": "0",
            "bill_use_delivery_address": True,
            "address_line": "10 Delivery Rd",
            "address_line2": "",
            "city": "London",
            "postal_code": "SW1A 1AA",
            "bill_company_name": "",
            "bill_contact_name": "",
            "bill_address_line": "",
            "bill_address_line2": "",
            "bill_city": "",
            "bill_postal_code": "",
        }
        data.update(overrides)
        return OrderAdminForm(data=data)

    def test_requires_delivery_address_line_city_and_postal_code(self):
        form = self._form(address_line="", city="", postal_code="")
        self.assertFalse(form.is_valid())
        self.assertIn("address_line", form.errors)
        self.assertIn("city", form.errors)
        self.assertIn("postal_code", form.errors)

    def test_accepts_complete_delivery_address(self):
        form = self._form()
        self.assertTrue(form.is_valid(), form.errors)

    def test_rejects_non_latin_delivery_address(self):
        form = self._form(address_line="Вулиця 1", city="Київ")
        self.assertFalse(form.is_valid())
        self.assertIn("address_line", form.errors)
        self.assertIn("city", form.errors)

    def test_rejects_invalid_uk_postal_code(self):
        form = self._form(postal_code="not-a-postcode")
        self.assertFalse(form.is_valid())
        self.assertIn("postal_code", form.errors)
