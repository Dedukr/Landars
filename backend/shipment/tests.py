from django.test import SimpleTestCase
from django.test.utils import override_settings

from shipment.method_mapping import (
    logical_shipping_option_for_billable_kg,
    pick_sendcloud_method_id,
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
