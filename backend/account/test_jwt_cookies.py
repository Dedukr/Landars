"""Tests for httpOnly refresh-token cookie auth hardening."""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from account.jwt_cookies import (
    clear_refresh_cookie,
    refresh_cookie_name,
    set_refresh_cookie,
)

User = get_user_model()


@override_settings(
    JWT_REFRESH_COOKIE_SECURE=False,
    JWT_REFRESH_COOKIE_SAMESITE="Lax",
)
class RefreshCookieAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.cookie_name = refresh_cookie_name()
        self.user = User.objects.create_user(
            email="cookie-auth@example.com",
            password="SecurePass123!",
            first_name="Cookie",
            surname="Auth",
            is_email_verified=True,
        )

    def _csrf_header(self):
        csrf_resp = self.client.get(reverse("csrf_token"))
        self.assertEqual(csrf_resp.status_code, 200)
        token = csrf_resp.data["csrfToken"]
        return {"HTTP_X_CSRFTOKEN": token}

    def _issue_tokens(self):
        refresh = RefreshToken.for_user(self.user)
        return str(refresh.access_token), str(refresh)

    def test_login_sets_httpOnly_refresh_cookie_without_body_refresh(self):
        from account import views as account_views

        original = getattr(account_views.login_view, "cls", None)
        throttle_classes = None
        if original is not None:
            throttle_classes = original.throttle_classes
            original.throttle_classes = []
        try:
            resp = self.client.post(
                reverse("login"),
                {
                    "email": "cookie-auth@example.com",
                    "password": "SecurePass123!",
                },
                format="json",
            )
        finally:
            if original is not None and throttle_classes is not None:
                original.throttle_classes = throttle_classes

        self.assertEqual(resp.status_code, 200)
        self.assertIn("access", resp.data)
        self.assertNotIn("refresh", resp.data)
        self.assertIn(self.cookie_name, resp.cookies)
        cookie = resp.cookies[self.cookie_name]
        self.assertTrue(cookie["httponly"])
        self.assertTrue(cookie.value)

    def test_cookie_refresh_returns_access_and_rotates_cookie(self):
        _access, refresh = self._issue_tokens()
        self.client.cookies[self.cookie_name] = refresh
        headers = self._csrf_header()

        refresh_resp = self.client.post(
            reverse("token_refresh"),
            {},
            format="json",
            **headers,
        )
        self.assertEqual(refresh_resp.status_code, 200)
        self.assertIn("access", refresh_resp.data)
        self.assertNotIn("refresh", refresh_resp.data)
        new_refresh = refresh_resp.cookies[self.cookie_name].value
        self.assertTrue(new_refresh)
        self.assertNotEqual(new_refresh, refresh)

    def test_logout_blacklists_and_clears_cookie(self):
        access, refresh_value = self._issue_tokens()
        self.client.cookies[self.cookie_name] = refresh_value
        headers = self._csrf_header()

        logout_resp = self.client.post(
            reverse("logout"),
            {},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
            **headers,
        )
        self.assertEqual(logout_resp.status_code, 200)
        self.assertEqual(logout_resp.cookies[self.cookie_name].value, "")

        self.client.cookies[self.cookie_name] = refresh_value
        denied = self.client.post(
            reverse("token_refresh"),
            {},
            format="json",
            **self._csrf_header(),
        )
        self.assertEqual(denied.status_code, 401)

    def test_legacy_body_refresh_still_accepted(self):
        refresh = RefreshToken.for_user(self.user)
        headers = self._csrf_header()
        resp = self.client.post(
            reverse("token_refresh"),
            {"refresh": str(refresh)},
            format="json",
            **headers,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access", resp.data)
        self.assertNotIn("refresh", resp.data)
        self.assertIn(self.cookie_name, resp.cookies)

    def test_set_refresh_cookie_helper_marks_httponly(self):
        response = Response({"ok": True})
        set_refresh_cookie(response, "dummy-refresh-token")
        cookie = response.cookies[self.cookie_name]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie.value, "dummy-refresh-token")

    @override_settings(JWT_REFRESH_COOKIE_SECURE=True)
    def test_clear_refresh_cookie_preserves_secure_flag(self):
        """Browsers only clear Secure cookies when Set-Cookie also has Secure."""
        response = Response({"ok": True})
        set_refresh_cookie(response, "dummy-refresh-token")
        set_cookie = response.cookies[self.cookie_name]
        self.assertTrue(set_cookie["secure"])
        self.assertTrue(set_cookie["httponly"])

        clear_refresh_cookie(response)
        cleared = response.cookies[self.cookie_name]
        self.assertEqual(cleared.value, "")
        self.assertTrue(cleared["secure"])
        self.assertTrue(cleared["httponly"])
        # Expired / max-age 0 (Django test client exposes max-age as string)
        self.assertIn(cleared["max-age"], ("0", 0))
