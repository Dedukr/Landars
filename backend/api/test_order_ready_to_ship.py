from decimal import Decimal

from django.contrib.admin.sites import site
from django.contrib.auth import get_user_model
from django.contrib.messages.storage.fallback import FallbackStorage
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase, override_settings

from api.admin import OrderAdmin, mark_orders_ready_to_ship
from api.models import CategoryGroup, Order, OrderItem, Product, ProductCategory
from api.services.order_ready_to_ship import validate_ready_to_ship

User = get_user_model()


@override_settings(POST_DELIVERY_CATEGORY_GROUP_ID=99)
class ReadyToShipPostDeliveryValidationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            name="Buyer", email="buyer@ready.test", password="x"
        )
        cls.post_category = ProductCategory.objects.create(name="Post sausages")
        cls.other_category = ProductCategory.objects.create(name="Fresh meat")
        cls.post_group = CategoryGroup.objects.create(pk=99, name="Post delivery")
        cls.post_group.categories.add(cls.post_category)

        cls.post_product = Product.objects.create(
            name="Smoked Sausage",
            base_price=Decimal("10.00"),
        )
        cls.post_product.categories.add(cls.post_category)

        cls.non_post_product = Product.objects.create(
            name="Fresh Steak",
            base_price=Decimal("20.00"),
        )
        cls.non_post_product.categories.add(cls.other_category)

    def _create_order(self, *, is_home_delivery: bool, products):
        order = Order.objects.create(
            customer=self.user,
            status="paid",
            is_home_delivery=is_home_delivery,
        )
        for product in products:
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=Decimal("1"),
            )
        return order

    def _run_bulk_ready_to_ship(self, order):
        admin_user = User.objects.create_superuser(
            name=f"Admin {order.pk}",
            email=f"admin{order.pk}@ready.test",
            password="x",
        )
        request = RequestFactory().post("/admin/api/order/")
        request.user = admin_user
        request.session = "session"
        messages = FallbackStorage(request)
        request._messages = messages

        mark_orders_ready_to_ship(
            OrderAdmin(Order, site),
            request,
            Order.objects.filter(pk=order.pk),
        )

    def test_post_delivery_order_with_compatible_products_passes(self):
        order = self._create_order(
            is_home_delivery=False,
            products=[self.post_product],
        )
        result = validate_ready_to_ship(order)
        self.assertTrue(result.ok)
        self.assertEqual(result.incompatible_products, ())

    def test_post_delivery_order_with_incompatible_product_fails(self):
        order = self._create_order(
            is_home_delivery=False,
            products=[self.post_product, self.non_post_product],
        )
        result = validate_ready_to_ship(order)
        self.assertFalse(result.ok)
        self.assertEqual(result.incompatible_products, ("Fresh Steak",))
        self.assertIn("Fresh Steak", result.message)
        self.assertIn("not compatible for post delivery", result.message)

    def test_home_delivery_order_with_incompatible_products_fails(self):
        order = self._create_order(
            is_home_delivery=True,
            products=[self.non_post_product],
        )
        result = validate_ready_to_ship(order)
        self.assertFalse(result.ok)
        self.assertEqual(result.incompatible_products, ("Fresh Steak",))

    def test_bulk_action_does_not_change_incompatible_post_orders(self):
        order = self._create_order(
            is_home_delivery=False,
            products=[self.non_post_product],
        )
        self._run_bulk_ready_to_ship(order)
        order.refresh_from_db()
        self.assertEqual(order.status, "paid")

    def test_bulk_action_does_not_change_incompatible_home_delivery_orders(self):
        order = self._create_order(
            is_home_delivery=True,
            products=[self.non_post_product],
        )
        self._run_bulk_ready_to_ship(order)
        order.refresh_from_db()
        self.assertEqual(order.status, "paid")

    def test_order_save_blocks_incompatible_ready_to_ship_transition(self):
        order = self._create_order(
            is_home_delivery=True,
            products=[self.non_post_product],
        )
        order.status = "ready_to_ship"
        with self.assertRaises(ValidationError):
            order.save(update_fields=["status"])

    def test_bulk_action_marks_compatible_post_orders_ready(self):
        order = self._create_order(
            is_home_delivery=False,
            products=[self.post_product],
        )
        self._run_bulk_ready_to_ship(order)

        order.refresh_from_db()
        self.assertEqual(order.status, "ready_to_ship")
