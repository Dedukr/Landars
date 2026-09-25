"""
Tests for the automatic multi-buy promo calculator (Jerky 5+1).

The calculator itself is pure Python — ``api.services.promotions`` only needs
objects exposing ``product`` and ``quantity`` — so those cases run as
``SimpleTestCase`` against lightweight stubs and never touch the database.
The model-level cases (``Cart``/``OrderItem``) need real rows and use ``TestCase``.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from api.models import Cart, Order, OrderItem, Product
from api.services.promotions import (
    JERKY_5_1,
    PromoResult,
    compute_promo,
    promo_definition_for_group,
    promo_definition_for_product,
    promo_label_for_items,
    promo_payload_for_product,
    promo_result_for_cart,
)

User = get_user_model()

JERKY_GROUP = JERKY_5_1.group


class StubProduct:
    """Minimal stand-in for ``Product`` (no database involved)."""

    def __init__(self, pk, price="6.00", promo_group=JERKY_GROUP, active=True):
        self.pk = pk
        self.price = Decimal(str(price))
        self.promo_group = promo_group
        self.active = active


class StubLine:
    """Minimal stand-in for a ``CartItem`` / ``OrderItem`` line."""

    def __init__(self, product, quantity, item_price=None):
        self.product = product
        self.quantity = Decimal(str(quantity))
        self.item_price = None if item_price is None else Decimal(str(item_price))


def jerky(product_id, quantity, price="6.00"):
    """One eligible line: ``quantity`` units of jerky ``product_id`` at ``price``."""
    return StubLine(StubProduct(product_id, price=price), quantity)


class PromoFreeUnitCountTests(SimpleTestCase):
    """Free units per basket size — the headline 5+1 rule."""

    def test_five_units_earn_nothing(self):
        result = compute_promo([jerky(1, 5)])
        self.assertEqual(result.eligible_quantity, 5)
        self.assertEqual(result.free_units, 0)
        self.assertEqual(result.discount, Decimal("0.00"))
        self.assertEqual(result.units_to_next_free, 1)
        self.assertFalse(result.applies)
        self.assertEqual(result.per_product_free, {})

    def test_six_units_earn_one_free(self):
        result = compute_promo([jerky(1, 6)])
        self.assertEqual(result.eligible_quantity, 6)
        self.assertEqual(result.free_units, 1)
        self.assertEqual(result.discount, Decimal("6.00"))
        self.assertTrue(result.applies)
        self.assertEqual(result.per_product_free, {1: Decimal("1.00")})

    def test_eleven_units_still_earn_one_free(self):
        result = compute_promo([jerky(1, 11)])
        self.assertEqual(result.free_units, 1)
        self.assertEqual(result.discount, Decimal("6.00"))
        self.assertEqual(result.units_to_next_free, 1)

    def test_twelve_units_earn_two_free(self):
        result = compute_promo([jerky(1, 12)])
        self.assertEqual(result.free_units, 2)
        self.assertEqual(result.discount, Decimal("12.00"))
        self.assertEqual(result.per_product_free, {1: Decimal("2.00")})

    def test_units_to_next_free_counts_down_within_a_group(self):
        counts = {
            units: compute_promo([jerky(1, units)]).units_to_next_free
            for units in (1, 2, 3, 4, 5, 6, 7, 12)
        }
        self.assertEqual(
            counts,
            {1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 6, 7: 5, 12: 6},
        )

    def test_empty_basket_needs_a_full_group(self):
        result = compute_promo([])
        self.assertEqual(result.eligible_quantity, 0)
        self.assertEqual(result.free_units, 0)
        self.assertEqual(result.discount, Decimal("0.00"))
        self.assertEqual(result.units_to_next_free, JERKY_5_1.group_size)
        self.assertEqual(result.per_product_free, {})
        self.assertEqual(result.per_product_discount, {})
        self.assertFalse(result.applies)


class PromoPoolingAndAttributionTests(SimpleTestCase):
    """Units pool across flavours; free units come off the cheapest lines."""

    def test_mixed_flavours_pool_into_one_group(self):
        result = compute_promo([jerky(3, 2), jerky(1, 2), jerky(2, 2)])
        self.assertEqual(result.eligible_quantity, 6)
        self.assertEqual(result.free_units, 1)
        self.assertEqual(result.discount, Decimal("6.00"))

    def test_equal_prices_tie_break_on_ascending_product_id(self):
        result = compute_promo([jerky(9, 3), jerky(4, 3)])
        self.assertEqual(result.per_product_free, {4: Decimal("1.00")})
        self.assertEqual(result.per_product_discount, {4: Decimal("6.00")})

    def test_free_units_are_priced_from_the_cheapest_units(self):
        result = compute_promo(
            [jerky(1, 6, price="6.00"), jerky(2, 6, price="4.50")]
        )
        self.assertEqual(result.free_units, 2)
        self.assertEqual(result.discount, Decimal("9.00"))
        self.assertEqual(result.per_product_free, {2: Decimal("2.00")})

    def test_free_units_spill_onto_the_next_cheapest_product(self):
        result = compute_promo(
            [jerky(1, 11, price="6.00"), jerky(2, 1, price="4.50")]
        )
        self.assertEqual(result.free_units, 2)
        self.assertEqual(result.discount, Decimal("10.50"))
        self.assertEqual(
            result.per_product_free,
            {2: Decimal("1.00"), 1: Decimal("1.00")},
        )
        self.assertEqual(
            result.per_product_discount,
            {2: Decimal("4.50"), 1: Decimal("6.00")},
        )

    def test_repeated_lines_for_one_product_merge_at_the_cheaper_price(self):
        product = StubProduct(1, price="6.00")
        result = compute_promo(
            [
                StubLine(product, 4, item_price="6.00"),
                StubLine(product, 2, item_price="4.50"),
            ]
        )
        self.assertEqual(result.eligible_quantity, 6)
        self.assertEqual(result.free_units, 1)
        self.assertEqual(result.discount, Decimal("4.50"))
        self.assertEqual(result.per_product_free, {1: Decimal("1.00")})

    def test_item_price_snapshot_wins_over_the_live_product_price(self):
        """An order line re-prices from its snapshot, never from the live product."""
        product = StubProduct(1, price="99.00")
        result = compute_promo([StubLine(product, 6, item_price="6.00")])
        self.assertEqual(result.discount, Decimal("6.00"))

    def test_per_product_lookups_tolerate_missing_ids(self):
        result = compute_promo([jerky(1, 6)])
        self.assertEqual(result.free_quantity_for_product(1), Decimal("1.00"))
        self.assertEqual(result.discount_for_product(1), Decimal("6.00"))
        self.assertEqual(result.free_quantity_for_product(2), Decimal("0.00"))
        self.assertEqual(result.discount_for_product(2), Decimal("0.00"))
        self.assertEqual(result.free_quantity_for_product(None), Decimal("0.00"))
        self.assertEqual(result.discount_for_product(None), Decimal("0.00"))


class PromoEligibilityTests(SimpleTestCase):
    """Which lines count towards the promotion."""

    def test_products_without_the_promo_flag_are_ignored(self):
        result = compute_promo(
            [
                jerky(1, 4),
                StubLine(StubProduct(2, promo_group=""), 8),
                StubLine(StubProduct(3, promo_group=None), 8),
                StubLine(StubProduct(4, promo_group="some_other_promo"), 8),
            ]
        )
        self.assertEqual(result.eligible_quantity, 4)
        self.assertEqual(result.free_units, 0)
        self.assertEqual(result.discount, Decimal("0.00"))

    def test_inactive_flagged_products_are_ignored(self):
        result = compute_promo(
            [jerky(1, 5), StubLine(StubProduct(2, active=False), 6)]
        )
        self.assertEqual(result.eligible_quantity, 5)
        self.assertEqual(result.free_units, 0)

    def test_lines_with_a_deleted_product_are_skipped(self):
        """``OrderItem.product`` is nullable; such lines must not break the maths."""
        result = compute_promo(
            [
                StubLine(None, 6),
                StubLine(StubProduct(None), 6),
                jerky(1, 6),
            ]
        )
        self.assertEqual(result.eligible_quantity, 6)
        self.assertEqual(result.free_units, 1)
        self.assertEqual(result.per_product_free, {1: Decimal("1.00")})

    def test_fractional_quantities_floor_to_whole_units(self):
        self.assertEqual(compute_promo([jerky(1, "5.99")]).free_units, 0)
        self.assertEqual(compute_promo([jerky(1, "5.99")]).eligible_quantity, 5)

        result = compute_promo([jerky(1, "6.50")])
        self.assertEqual(result.eligible_quantity, 6)
        self.assertEqual(result.free_units, 1)
        self.assertEqual(result.discount, Decimal("6.00"))

        # Fractional remainders across lines never add up to a whole unit.
        pooled = compute_promo([jerky(1, "2.50"), jerky(2, "3.50")])
        self.assertEqual(pooled.eligible_quantity, 5)
        self.assertEqual(pooled.free_units, 0)

    def test_zero_and_negative_quantities_are_ignored(self):
        result = compute_promo([jerky(1, 6), jerky(2, 0), jerky(3, "-4")])
        self.assertEqual(result.eligible_quantity, 6)
        self.assertEqual(result.per_product_free, {1: Decimal("1.00")})


class PromoDefinitionLookupTests(SimpleTestCase):
    """The definition registry and the storefront-facing descriptors."""

    def test_definition_shape(self):
        self.assertEqual(JERKY_5_1.group, "jerky_5_1")
        self.assertEqual(JERKY_5_1.group_size, 6)
        self.assertEqual(JERKY_5_1.free_per_group, 1)
        self.assertEqual(JERKY_5_1.paid_per_group, 5)
        self.assertEqual(JERKY_5_1.label, "Jerky 5+1")

    def test_group_lookup(self):
        self.assertIs(promo_definition_for_group("jerky_5_1"), JERKY_5_1)
        self.assertIs(promo_definition_for_group("  jerky_5_1  "), JERKY_5_1)
        self.assertIsNone(promo_definition_for_group(""))
        self.assertIsNone(promo_definition_for_group(None))
        self.assertIsNone(promo_definition_for_group("nope"))

    def test_product_lookup_respects_active_flag(self):
        self.assertIs(promo_definition_for_product(StubProduct(1)), JERKY_5_1)
        self.assertIsNone(promo_definition_for_product(None))
        self.assertIsNone(
            promo_definition_for_product(StubProduct(1, active=False))
        )
        self.assertIsNone(
            promo_definition_for_product(StubProduct(1, promo_group=""))
        )

    def test_product_payload_for_the_detail_page(self):
        self.assertEqual(
            promo_payload_for_product(StubProduct(1)),
            {
                "group": "jerky_5_1",
                "label": "Jerky 5+1",
                "description": "Buy any 5 Jerky, get 1 free",
                "group_size": 6,
                "free_per_group": 1,
                "paid_per_group": 5,
                "badge": "5 + 1 FREE",
            },
        )
        self.assertIsNone(promo_payload_for_product(StubProduct(1, active=False)))

    def test_label_for_items_falls_back_to_the_default(self):
        self.assertEqual(promo_label_for_items([jerky(1, 1)]), "Jerky 5+1")
        self.assertEqual(
            promo_label_for_items([StubLine(StubProduct(1, promo_group=""), 6)]),
            "Jerky 5+1",
        )
        self.assertEqual(promo_label_for_items([], default=""), "")

    def test_result_exposes_the_definition(self):
        result = PromoResult(definition=JERKY_5_1)
        self.assertEqual(result.group, "jerky_5_1")
        self.assertEqual(result.label, "Jerky 5+1")
        self.assertEqual(result.description, "Buy any 5 Jerky, get 1 free")
        self.assertEqual(result.group_size, 6)
        self.assertFalse(result.applies)


class CartPromoTests(TestCase):
    """``Cart.promo_discount`` / ``Cart.total_price`` on real rows."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="cart-promo@example.com",
            password="SecurePass123!",
            first_name="Cart",
            surname="Promo",
            is_email_verified=True,
        )
        self.cart = Cart.objects.create(user=self.user)
        self.jerky = Product.objects.create(
            name="Beef Jerky",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        self.other = Product.objects.create(
            name="Crisps",
            base_price=Decimal("2.00"),
            holiday_fee=Decimal("0"),
            active=True,
        )

    def test_five_jerky_get_no_discount(self):
        self.cart.items.create(product=self.jerky, quantity=5)
        self.assertEqual(self.cart.sum_price, Decimal("30.00"))
        self.assertEqual(self.cart.promo_discount, Decimal("0.00"))
        self.assertEqual(self.cart.total_price, Decimal("30.00"))

    def test_six_jerky_discount_one_unit(self):
        self.cart.items.create(product=self.jerky, quantity=6)
        self.assertEqual(self.cart.sum_price, Decimal("36.00"))
        self.assertEqual(self.cart.promo_discount, Decimal("6.00"))
        self.assertEqual(self.cart.total_price, Decimal("30.00"))
        self.assertEqual(self.cart.promo_summary.free_units, 1)
        self.assertEqual(self.cart.promo_summary.units_to_next_free, 6)

    def test_promo_stacks_with_the_save10_coupon(self):
        self.cart.items.create(product=self.jerky, quantity=6)
        self.cart.discount = Decimal("3.60")  # save10 on the pre-promo sum_price
        self.cart.save(update_fields=["discount"])

        self.assertEqual(self.cart.sum_price, Decimal("36.00"))
        self.assertEqual(self.cart.promo_discount, Decimal("6.00"))
        self.assertEqual(self.cart.total_price, Decimal("26.40"))

    def test_delivery_fee_is_added_after_the_promo(self):
        self.cart.items.create(product=self.jerky, quantity=6)
        self.cart.delivery_fee = Decimal("4.99")
        self.cart.save(update_fields=["delivery_fee"])
        self.assertEqual(self.cart.total_price, Decimal("34.99"))

    def test_non_promo_items_do_not_earn_a_discount(self):
        self.cart.items.create(product=self.other, quantity=10)
        self.cart.items.create(product=self.jerky, quantity=3)
        self.assertEqual(self.cart.promo_discount, Decimal("0.00"))
        self.assertEqual(self.cart.total_price, Decimal("38.00"))

    def test_inactive_jerky_stops_earning_the_promo(self):
        self.cart.items.create(product=self.jerky, quantity=6)
        self.assertEqual(self.cart.promo_discount, Decimal("6.00"))

        Product.objects.filter(pk=self.jerky.pk).update(active=False)
        reloaded = Cart.objects.get(pk=self.cart.pk)
        self.assertEqual(reloaded.promo_discount, Decimal("0.00"))

    def test_promo_result_for_cart_is_memoised_per_instance(self):
        self.cart.items.create(product=self.jerky, quantity=6)
        first = promo_result_for_cart(self.cart)
        self.assertIs(promo_result_for_cart(self.cart), first)

        # A freshly loaded cart recomputes from the current lines.
        reloaded = Cart.objects.get(pk=self.cart.pk)
        reloaded.items.filter(product=self.jerky).update(quantity=12)
        self.assertEqual(promo_result_for_cart(reloaded).free_units, 2)


class OrderItemPromoTests(TestCase):
    """Per-line promo helpers and the frozen order-level promo total."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="order-promo@example.com",
            password="SecurePass123!",
            first_name="Order",
            surname="Promo",
            is_email_verified=True,
        )
        self.jerky = Product.objects.create(
            name="Beef Jerky",
            base_price=Decimal("6.00"),
            holiday_fee=Decimal("0"),
            active=True,
            promo_group=Product.PromoGroup.JERKY_5_1,
        )
        self.order = Order.objects.create(
            customer=self.user,
            status="pending",
            promo_discount=Decimal("6.00"),
        )

    def test_free_units_discount_the_line_but_not_its_gross_total(self):
        item = OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )
        self.assertEqual(item.get_total_price(), Decimal("36.00"))
        self.assertEqual(item.get_promo_discount(), Decimal("6.00"))
        self.assertEqual(item.get_net_total_price(), Decimal("30.00"))

    def test_line_without_free_units_has_no_promo_discount(self):
        item = OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("2.00"),
        )
        self.assertEqual(item.free_quantity, Decimal("0"))
        self.assertEqual(item.get_promo_discount(), Decimal("0.00"))
        self.assertEqual(item.get_net_total_price(), item.get_total_price())

    def test_promo_discount_uses_the_price_snapshot_not_the_live_product(self):
        item = OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )
        self.jerky.base_price = Decimal("99.00")
        self.jerky.save(update_fields=["base_price"])

        item.refresh_from_db()
        self.assertEqual(item.item_price, Decimal("6.00"))
        self.assertEqual(item.get_promo_discount(), Decimal("6.00"))

    def test_deleted_product_keeps_its_promo_discount(self):
        item = OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )
        self.jerky.delete()

        item.refresh_from_db()
        self.assertIsNone(item.product)
        self.assertEqual(item.get_promo_discount(), Decimal("6.00"))
        self.assertEqual(item.get_net_total_price(), Decimal("30.00"))

    def test_order_totals_subtract_the_frozen_promo(self):
        OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )
        order = Order.objects.get(pk=self.order.pk)
        self.assertEqual(order.sum_price, Decimal("36.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))
        self.assertEqual(order.promo_free_units, 1)
        self.assertEqual(order.promo_label, "Jerky 5+1")

    def test_order_without_promo_has_no_label(self):
        order = Order.objects.create(customer=self.user, status="pending")
        OrderItem.objects.create(
            order=order, product=self.jerky, quantity=Decimal("2.00")
        )
        self.assertEqual(order.promo_discount, Decimal("0"))
        self.assertEqual(order.promo_label, "")
        self.assertEqual(order.promo_free_units, 0)
        self.assertEqual(order.total_price, Decimal("12.00"))

    def test_order_promo_is_frozen_when_the_product_flag_is_cleared(self):
        OrderItem.objects.create(
            order=self.order,
            product=self.jerky,
            quantity=Decimal("6.00"),
            free_quantity=Decimal("1.00"),
        )
        Product.objects.filter(pk=self.jerky.pk).update(promo_group="")

        order = Order.objects.get(pk=self.order.pk)
        self.assertEqual(order.promo_discount, Decimal("6.00"))
        self.assertEqual(order.total_price, Decimal("30.00"))
        # Falls back to the default label rather than losing the summary row.
        self.assertEqual(order.promo_label, "Jerky 5+1")
