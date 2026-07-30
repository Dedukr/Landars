from __future__ import annotations

import os
import unittest
from unittest import mock

from django.test import SimpleTestCase, override_settings

from festival.services.cputil import (
    STARPRNT_MEDIA_TYPE,
    convert_markup,
    cputil_available,
    reset_cputil_cache,
)


@override_settings(FESTIVAL_CPUTIL_PATH="/nonexistent/cputil")
class CPUtilWrapperTests(SimpleTestCase):
    def setUp(self):
        reset_cputil_cache()

    def tearDown(self):
        reset_cputil_cache()

    def test_unavailable_when_binary_missing(self):
        self.assertFalse(cputil_available())

    def test_markup_passthrough_and_plain_fallback(self):
        markup = "[align: center]TOTAL £1.00[plain]\n[cut]\n"
        self.assertEqual(
            convert_markup(markup, "text/vnd.star.markup"),
            markup.encode("utf-8"),
        )
        plain = convert_markup(markup, "text/plain")
        self.assertEqual(plain, b"TOTAL \x9c1.00\n\n")


@unittest.skipUnless(
    os.path.isfile(os.environ.get("FESTIVAL_CPUTIL_PATH", ""))
    and os.access(os.environ.get("FESTIVAL_CPUTIL_PATH", ""), os.X_OK),
    "Live CPUtil binary not configured via FESTIVAL_CPUTIL_PATH",
)
class CPUtilLiveConvertTests(SimpleTestCase):
    def setUp(self):
        reset_cputil_cache()

    def tearDown(self):
        reset_cputil_cache()

    @override_settings(
        FESTIVAL_CPUTIL_PATH=os.environ.get("FESTIVAL_CPUTIL_PATH", "")
    )
    def test_live_starprnt_convert_is_deterministic(self):
        markup = (
            "[align: center]\n"
            "[magnify: width 2; height 2]\n"
            "KITCHEN\n"
            "[plain]\n"
            "TOTAL £12.50\n"
            "[cut]\n"
        )
        reset_cputil_cache()
        self.assertTrue(cputil_available())
        a = convert_markup(markup, STARPRNT_MEDIA_TYPE)
        b = convert_markup(markup, STARPRNT_MEDIA_TYPE)
        self.assertEqual(a, b)
        self.assertGreater(len(a), 20)
        self.assertTrue(a.startswith(b"\x1b"))
