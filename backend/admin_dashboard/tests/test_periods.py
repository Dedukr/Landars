from datetime import timedelta

from django.test import TestCase

from admin_dashboard.periods import (
    DEFAULT_PERIOD,
    get_period_range,
    normalize_period,
)


class DashboardPeriodTests(TestCase):
    def test_normalize_period_defaults_unknown_to_30d(self):
        self.assertEqual(normalize_period(None), DEFAULT_PERIOD)
        self.assertEqual(normalize_period("invalid"), "30d")

    def test_get_period_range_30d(self):
        date_from, date_to = get_period_range("30d")
        self.assertLessEqual(date_to - date_from, timedelta(days=30, seconds=5))
        self.assertGreaterEqual(date_to - date_from, timedelta(days=29))

    def test_get_period_range_this_month_starts_on_first_day(self):
        date_from, date_to = get_period_range("this_month")
        self.assertEqual(date_from.day, 1)
        self.assertEqual(date_from.hour, 0)
        self.assertLess(date_from, date_to)

    def test_get_period_range_invalid_uses_30_day_window(self):
        invalid_from, _ = get_period_range("not-valid")
        thirty_from, _ = get_period_range("30d")
        self.assertEqual(invalid_from.date(), thirty_from.date())
