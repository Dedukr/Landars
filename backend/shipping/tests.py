from decimal import Decimal

from django.test import SimpleTestCase
from django.test.utils import override_settings

from shipping.method_mapping import (
    logical_shipping_option_for_billable_kg,
    logical_shipping_option_for_method_row,
    pick_sendcloud_method_id,
    resolve_checkout_sendcloud_method_id,
)

# Royal Mail v2–style matrix (ids match a typical Sendcloud account; bounds are illustrative).
_RM_V2_48 = [
    {
        "id": 29632,
        "name": "Royal Mail Tracked 48 - Small Parcel",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "0",
        "max_weight": "2",
    },
    {
        "id": 29633,
        "name": "Royal Mail Tracked 48 - Medium Parcel 0-5kg",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "0",
        "max_weight": "5",
    },
    {
        "id": 29634,
        "name": "Royal Mail Tracked 48 - Medium Parcel 5-10kg",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "5",
        "max_weight": "10",
    },
    {
        "id": 29635,
        "name": "Royal Mail Tracked 48 - Medium Parcel 10-20kg",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "10",
        "max_weight": "20",
    },
]

_RM_V2_24 = [
    {
        "id": 29622,
        "name": "Royal Mail Tracked 24 - Small Parcel",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "0",
        "max_weight": "2",
    },
    {
        "id": 29623,
        "name": "Royal Mail Tracked 24 - Medium Parcel 0-5kg",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "0",
        "max_weight": "5",
    },
    {
        "id": 29624,
        "name": "Royal Mail Tracked 24 - Medium Parcel 5-10kg",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "5",
        "max_weight": "10",
    },
    {
        "id": 29625,
        "name": "Royal Mail Tracked 24 - Medium Parcel 10-20kg",
        "carrier": {"code": "royal_mailv2"},
        "min_weight": "10",
        "max_weight": "20",
    },
]


class SnapshotTotalItemQuantityTests(SimpleTestCase):
    def test_preserves_fractional_sum(self):
        from shipping.services import _snapshot_total_item_quantity

        self.assertEqual(
            _snapshot_total_item_quantity(Decimal("1") + Decimal("0.5")),
            Decimal("1.50"),
        )

    def test_zero_sum_becomes_minimum(self):
        from shipping.services import _snapshot_total_item_quantity

        self.assertEqual(
            _snapshot_total_item_quantity(Decimal("0")),
            Decimal("0.01"),
        )

    def test_parcel_items_keep_decimal_quantity_strings(self):
        from shipping.tasks import _parcel_items_from_snapshot

        rows = _parcel_items_from_snapshot(
            [{"name": "Jam", "quantity": "2.25", "unit_weight_kg": "0.4", "line_total": "5"}]
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["quantity"], "2.25")


class LogicalShippingOptionTests(SimpleTestCase):
    @override_settings(POST_SHIPMENT_TRACKED_24_MIN_KG=None)
    def test_all_weights_use_tracked_48_when_no_t24_threshold(self):
        self.assertEqual(logical_shipping_option_for_billable_kg(0.5), "uk_tracked_48")
        self.assertEqual(logical_shipping_option_for_billable_kg(15.0), "uk_tracked_48")

    @override_settings(POST_SHIPMENT_TRACKED_24_MIN_KG=3.0)
    def test_t24_only_when_weight_strictly_above_threshold(self):
        self.assertEqual(logical_shipping_option_for_billable_kg(2.5), "uk_tracked_48")
        self.assertEqual(logical_shipping_option_for_billable_kg(3.0), "uk_tracked_48")
        self.assertEqual(logical_shipping_option_for_billable_kg(3.001), "uk_tracked_24")
        self.assertEqual(logical_shipping_option_for_billable_kg(50.0), "uk_tracked_24")

    @override_settings(POST_SHIPMENT_TRACKED_24_MIN_KG=2.0)
    def test_t24_threshold_two_uses_48_at_two_kg(self):
        self.assertEqual(logical_shipping_option_for_billable_kg(2.0), "uk_tracked_48")
        self.assertEqual(logical_shipping_option_for_billable_kg(2.001), "uk_tracked_24")


class PickSendcloudMethodIdTests(SimpleTestCase):
    def test_tracked_48_weight_tiers_small_and_medium(self):
        for weight_kg, expect_id in (
            (1.0, 29632),
            (3.0, 29633),
            (7.0, 29634),
            (15.0, 29635),
        ):
            with self.subTest(weight_kg=weight_kg):
                self.assertEqual(
                    pick_sendcloud_method_id(_RM_V2_48, "uk_tracked_48", weight_kg),
                    expect_id,
                )

    def test_tracked_24_weight_tiers_small_and_medium(self):
        for weight_kg, expect_id in (
            (1.0, 29622),
            (3.0, 29623),
            (7.0, 29624),
            (15.0, 29625),
        ):
            with self.subTest(weight_kg=weight_kg):
                self.assertEqual(
                    pick_sendcloud_method_id(_RM_V2_24, "uk_tracked_24", weight_kg),
                    expect_id,
                )

    def test_tracked_48_excludes_signed_and_large_letter_but_keeps_medium(self):
        methods = list(_RM_V2_48) + [
            {
                "id": 29631,
                "name": "Royal Mail Tracked 48 - Large Letter",
                "carrier": {"code": "royal_mailv2"},
                "min_weight": "0",
                "max_weight": "0.75",
            },
            {
                "id": 29637,
                "name": "Royal Mail Tracked 48 Signed - Small Parcel",
                "carrier": {"code": "royal_mailv2"},
                "min_weight": "0",
                "max_weight": "2",
            },
        ]
        self.assertEqual(pick_sendcloud_method_id(methods, "uk_tracked_48", 1.0), 29632)
        self.assertEqual(pick_sendcloud_method_id(methods, "uk_tracked_48", 4.0), 29633)

    def test_heavy_parcel_not_mapped_to_zero_to_five_band_when_api_omits_max(self):
        methods = [
            {
                "id": 101,
                "name": "UK Tracked 48 0-5kg",
                "carrier": {"code": "royal_mail", "name": "Royal Mail"},
                "min_weight": "0",
            },
            {
                "id": 202,
                "name": "UK Tracked 48 10-20kg",
                "carrier": {"code": "royal_mail", "name": "Royal Mail"},
                "min_weight": "10",
                "max_weight": "20",
            },
        ]
        chosen = pick_sendcloud_method_id(methods, "uk_tracked_48", 13.0)
        self.assertEqual(chosen, 202)

    def test_prefers_tightest_max_among_matches(self):
        methods = [
            {
                "id": 300,
                "name": "UK Tracked 48 10-20kg",
                "carrier": "royal_mail",
                "min_weight": 10,
                "max_weight": 20,
            },
            {
                "id": 400,
                "name": "UK Tracked 48 5-15kg",
                "carrier": "royal_mail",
                "min_weight": 5,
                "max_weight": 15,
            },
        ]
        chosen = pick_sendcloud_method_id(methods, "uk_tracked_48", 12.0)
        self.assertEqual(chosen, 400)

    def test_legacy_uk_standard_small_parcel_still_resolves_tracked_48_small_only(self):
        methods = [
            {
                "id": 29632,
                "name": "Royal Mail Tracked 48 - Small Parcel",
                "carrier": {"code": "royal_mailv2"},
                "min_weight": "0",
                "max_weight": "2",
            },
            {
                "id": 29633,
                "name": "Royal Mail Tracked 48 - Medium Parcel 0-5kg",
                "carrier": {"code": "royal_mailv2"},
                "min_weight": "0",
                "max_weight": "5",
            },
        ]
        self.assertEqual(
            pick_sendcloud_method_id(methods, "uk_standard_small_parcel", 1.0),
            29632,
        )
        with self.assertRaises(ValueError):
            pick_sendcloud_method_id(methods, "uk_standard_small_parcel", 3.0)

    def test_untracked_name_still_matches_legacy_small_parcel_spec(self):
        methods = [
            {
                "id": 55,
                "name": "Royal Mail Untracked 48 Small Parcel 0-2kg",
                "carrier": {"code": "royal_mail"},
                "min_weight": "0",
                "max_weight": "2",
            },
        ]
        self.assertEqual(
            pick_sendcloud_method_id(methods, "uk_standard_small_parcel", 1.0),
            55,
        )


class ResolveCheckoutSendcloudMethodIdTests(SimpleTestCase):
    def test_returns_checkout_id_when_row_valid_for_weight(self):
        methods = list(_RM_V2_48)
        self.assertEqual(
            resolve_checkout_sendcloud_method_id(methods, 29633, 3.0),
            29633,
        )

    def test_none_when_id_missing_from_methods(self):
        self.assertIsNone(
            resolve_checkout_sendcloud_method_id(_RM_V2_48, 99999, 3.0),
        )

    def test_none_when_weight_outside_row_bounds(self):
        self.assertIsNone(
            resolve_checkout_sendcloud_method_id(_RM_V2_48, 29632, 5.0),
        )

    def test_none_when_row_not_matched_spec(self):
        alien = [
            {
                "id": 111,
                "name": "DPD Next Day",
                "carrier": {"code": "dpd"},
                "min_weight": "0",
                "max_weight": "20",
            },
        ]
        self.assertIsNone(resolve_checkout_sendcloud_method_id(alien, 111, 3.0))


class LogicalOptionForMethodRowTests(SimpleTestCase):
    def test_tracked_48_small_maps(self):
        row = _RM_V2_48[0]
        self.assertEqual(
            logical_shipping_option_for_method_row(row),
            "uk_tracked_48",
        )


class ShipmentModelTests(SimpleTestCase):
    def test_shipment_db_table_matches_shipping_app(self):
        from shipping.models import Shipment

        self.assertEqual(Shipment._meta.db_table, "shipping_shipment")
        self.assertEqual(Shipment._meta.app_label, "shipping")


class ShipmentMergedCheckoutFieldsTests(SimpleTestCase):
    """Checkout / webhook fields live on :class:`~shipping.models.Shipment` (ORM ``shipping_details``)."""

    def test_order_reverse_accessor_name(self):
        from shipping.models import Shipment

        rel = Shipment._meta.get_field("order")
        self.assertEqual(rel.remote_field.related_name, "shipping_details")
        field_names = {f.name for f in Shipment._meta.get_fields()}
        self.assertIn("shipping_method_id", field_names)
        self.assertIn("sendcloud_inputs", field_names)
