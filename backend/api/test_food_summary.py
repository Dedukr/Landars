from decimal import Decimal

from django.test import TestCase, override_settings

from api.admin import OrderAdmin
from api.models import CategoryGroup, Order, OrderItem, Product, ProductCategory
from api.services.frozen_categories import product_has_frozen_category
from django.contrib.auth import get_user_model

User = get_user_model()


@override_settings(FROZEN_CATEGORY_GROUP_ID=42)
class FoodSummaryFrozenCategoryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            name="Buyer", email="buyer@frozen.test", password="x"
        )
        cls.frozen_category = ProductCategory.objects.create(name="Varenyky")
        cls.ready_category = ProductCategory.objects.create(name="Soups")
        cls.frozen_group = CategoryGroup.objects.create(pk=42, name="Frozen products")
        cls.frozen_group.categories.add(cls.frozen_category)

        cls.frozen_product = Product.objects.create(
            name="Frozen Dumplings",
            base_price=Decimal("8.00"),
        )
        cls.frozen_product.categories.add(cls.frozen_category)

        cls.ready_product = Product.objects.create(
            name="Borscht",
            base_price=Decimal("6.00"),
        )
        cls.ready_product.categories.add(cls.ready_category)

    def test_product_has_frozen_category_uses_group_membership(self):
        self.assertTrue(product_has_frozen_category(self.frozen_product))
        self.assertFalse(product_has_frozen_category(self.ready_product))

    def test_build_food_summary_rows_splits_frozen_and_ready(self):
        order = Order.objects.create(customer=self.user, status="paid")
        OrderItem.objects.create(
            order=order, product=self.frozen_product, quantity=Decimal("3")
        )
        OrderItem.objects.create(
            order=order, product=self.ready_product, quantity=Decimal("2")
        )

        admin = OrderAdmin(Order, None)
        frozen_list, ready_list, _ = admin._build_food_summary_rows(
            Order.objects.filter(pk=order.pk)
        )

        self.assertIn(("Frozen Dumplings", 3.0), frozen_list)
        self.assertIn(("Borscht", 2.0), ready_list)
        self.assertNotIn(("Borscht", 2.0), frozen_list)
        self.assertNotIn(("Frozen Dumplings", 3.0), ready_list)

    def test_food_summary_filename_skips_null_delivery_dates(self):
        order = Order.objects.create(
            customer=self.user, status="paid", delivery_date=None
        )
        admin = OrderAdmin(Order, None)
        suffix = admin._food_summary_filename_suffix(
            Order.objects.filter(pk=order.pk).values_list("delivery_date", flat=True)
        )
        self.assertEqual(suffix, "Orders")
