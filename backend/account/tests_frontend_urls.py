from django.test import SimpleTestCase, override_settings

from account.frontend_urls import get_public_frontend_base_url


class FrontendUrlHelperTests(SimpleTestCase):
    @override_settings(
        FRONTEND_URL="https://landarsfood.com",
        URL_BASE="https://ignored.example",
        SITE_URL="https://also-ignored.example",
    )
    def test_prefers_frontend_url(self):
        self.assertEqual(
            get_public_frontend_base_url(), "https://landarsfood.com"
        )

    @override_settings(
        FRONTEND_URL="",
        URL_BASE="https://localhost/",
        SITE_URL="https://fallback.example",
    )
    def test_falls_back_to_url_base_and_strips_slash(self):
        self.assertEqual(get_public_frontend_base_url(), "https://localhost")

    @override_settings(FRONTEND_URL="", URL_BASE="", SITE_URL="")
    def test_default_when_unset(self):
        self.assertEqual(get_public_frontend_base_url(), "https://localhost")
