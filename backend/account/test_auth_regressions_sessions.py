"""Regression tests for session handling (F6): refresh rotation grace, logout, CSRF.

Cookies are httpOnly refresh tokens on ``/api/auth/``; refresh needs a CSRF header.
"""

from __future__ import annotations

import json
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from account.jwt_cookies import refresh_cookie_name
from account.models import CustomUser

User = CustomUser


def auth_events(cm, op=None):
    events = []
    for line in cm.output:
        body = line.split(":", 2)[2].split("\n", 1)[0]
        try:
            event = json.loads(body)
        except ValueError:
            continue
        if op is None or event.get("op") == op:
            events.append(event)
    return events


@override_settings(
    JWT_REFRESH_COOKIE_SECURE=False,
    JWT_REFRESH_COOKIE_SAMESITE="Lax",
    JWT_REFRESH_ROTATION_GRACE_SECONDS=30,
)
class SessionTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.cookie = refresh_cookie_name()
        self.user = User.objects.create_user(
            email="session@example.com",
            password="SecurePass123!",
            first_name="Ses",
            surname="Sion",
            is_email_verified=True,
        )

    def csrf(self):
        response = self.client.get(reverse("csrf_token"))
        self.assertEqual(response.status_code, 200)
        return {"HTTP_X_CSRFTOKEN": response.data["csrfToken"]}

    def new_refresh(self):
        return str(RefreshToken.for_user(self.user))

    def refresh(self, cookie, *, headers=None, body=None):
        if cookie is None:
            self.client.cookies.pop(self.cookie, None)
        else:
            self.client.cookies[self.cookie] = cookie
        return self.client.post(
            reverse("token_refresh"),
            body or {},
            format="json",
            **(self.csrf() if headers is None else headers),
        )


class RefreshGraceTests(SessionTestBase):
    def test_second_refresh_with_the_same_cookie_is_honoured_inside_the_grace_window(self):
        """Old: two tabs refreshing at once -> the loser got 401 "Token is blacklisted"
        and the SPA logged the customer out."""
        original = self.new_refresh()
        with self.assertLogs("account.auth", level="INFO") as cm:
            winner = self.refresh(original)
            rotated = winner.cookies[self.cookie].value  # (test client reuses the Morsel)
            loser = self.refresh(original)

        self.assertEqual(winner.status_code, 200)
        self.assertTrue(rotated and rotated != original)

        self.assertEqual(loser.status_code, 200, loser.data)
        self.assertEqual(set(loser.data), {"access"})
        self.assertNotIn(self.cookie, loser.cookies)  # the winner's cookie stays in place
        access = AccessToken(loser.data["access"])
        self.assertEqual(int(access["user_id"]), self.user.pk)

        stages = [(e["outcome"], e["stage"]) for e in auth_events(cm, "refresh")]
        self.assertEqual(stages, [("success", "success"), ("success", "grace_reuse")])
        self.assertNotIn(original, "\n".join(cm.output))
        self.assertEqual(
            [e["user_id"] for e in auth_events(cm, "refresh")], [self.user.pk, self.user.pk]
        )

    def test_the_rotated_token_itself_keeps_working(self):
        original = self.new_refresh()
        rotated = self.refresh(original).cookies[self.cookie].value
        again = self.refresh(rotated)
        self.assertEqual(again.status_code, 200)
        self.assertIn(self.cookie, again.cookies)

    def test_reuse_after_the_grace_window_is_rejected(self):
        original = self.new_refresh()
        self.assertEqual(self.refresh(original).status_code, 200)
        cache.clear()  # the marker's TTL ran out
        with self.assertLogs("account.auth", level="INFO") as cm:
            late = self.refresh(original)
        self.assertEqual(late.status_code, 401)
        self.assertEqual(late.data["code"], "token_not_valid")
        event = auth_events(cm, "refresh")[0]
        self.assertEqual((event["outcome"], event["stage"], event["status"]), ("rejected", "blacklisted", 401))

    def test_grace_can_be_disabled(self):
        with override_settings(JWT_REFRESH_ROTATION_GRACE_SECONDS=0):
            original = self.new_refresh()
            self.assertEqual(self.refresh(original).status_code, 200)
            self.assertEqual(self.refresh(original).status_code, 401)

    def test_a_token_blacklisted_by_logout_is_rejected_even_inside_the_window(self):
        token = self.new_refresh()
        self.client.cookies[self.cookie] = token
        self.assertEqual(self.client.post(reverse("logout"), {}, format="json").status_code, 200)
        self.assertEqual(self.refresh(token).status_code, 401)

    def test_logout_also_ends_the_grace_window_of_an_earlier_rotation(self):
        original = self.new_refresh()
        rotated = self.refresh(original).cookies[self.cookie].value
        self.client.cookies[self.cookie] = rotated
        self.assertEqual(self.client.post(reverse("logout"), {}, format="json").status_code, 200)
        self.assertEqual(self.refresh(original).status_code, 401)

    def test_grace_is_refused_for_a_user_who_was_deactivated_meanwhile(self):
        original = self.new_refresh()
        self.assertEqual(self.refresh(original).status_code, 200)
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.refresh(original).status_code, 401)

    def test_a_cache_outage_degrades_to_the_old_behaviour_instead_of_erroring(self):
        from unittest.mock import patch

        original = self.new_refresh()
        with patch("account.views.cache.set", side_effect=RuntimeError("redis down")), self.assertLogs(
            "account", level="WARNING"
        ):
            self.assertEqual(self.refresh(original).status_code, 200)
        with patch("account.views.cache.get", side_effect=RuntimeError("redis down")), self.assertLogs(
            "account", level="WARNING"
        ):
            self.assertEqual(self.refresh(original).status_code, 401)

    def test_legacy_body_token_gets_the_same_grace(self):
        original = self.new_refresh()
        self.assertEqual(self.refresh(None, body={"refresh": original}).status_code, 200)
        second = self.refresh(None, body={"refresh": original})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(set(second.data), {"access"})


class RefreshRejectionTests(SessionTestBase):
    def test_garbage_expired_and_wrong_type_tokens_are_401(self):
        expired = RefreshToken.for_user(self.user)
        expired.set_exp(from_time=timezone.now() - timedelta(days=10), lifetime=timedelta(days=1))
        cases = {
            "garbage": "not.a.jwt",
            "empty-ish": "x",
            "expired": str(expired),
            "access-token": str(RefreshToken.for_user(self.user).access_token),
        }
        for name, cookie in cases.items():
            with self.subTest(case=name):
                with self.assertLogs("account.auth", level="INFO") as cm:
                    response = self.refresh(cookie)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.data["code"], "token_not_valid")
                self.assertNotIn(self.cookie, response.cookies)
                event = auth_events(cm, "refresh")[0]
                self.assertEqual((event["outcome"], event["stage"]), ("rejected", "invalid"))
                self.assertNotIn(cookie, "\n".join(cm.output))

    def test_missing_cookie_is_401_and_logged_as_no_cookie(self):
        with self.assertLogs("account.auth", level="INFO") as cm:
            response = self.refresh(None)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(auth_events(cm, "refresh")[0]["stage"], "no_cookie")

    def test_csrf_mismatch_is_403_and_logged(self):
        token = self.new_refresh()
        self.client.cookies[self.cookie] = token
        self.client.get(reverse("csrf_token"))  # csrftoken cookie exists...
        with self.assertLogs("account.auth", level="INFO") as cm:
            wrong = self.client.post(
                reverse("token_refresh"), {}, format="json", HTTP_X_CSRFTOKEN="wrong-token"
            )
            missing = self.client.post(reverse("token_refresh"), {}, format="json")
        for response in (wrong, missing):
            self.assertEqual(response.status_code, 403)
            self.assertIn("CSRF", str(response.data["detail"]))
            self.assertTrue(response["X-Request-ID"])
        events = auth_events(cm, "refresh")
        self.assertEqual([(e["outcome"], e["stage"], e["status"]) for e in events], [("rejected", "csrf", 403)] * 2)
        # A rejected CSRF check must not consume the token.
        self.assertEqual(self.refresh(token).status_code, 200)

    def test_rejections_carry_a_request_id_header(self):
        response = self.refresh("garbage")
        self.assertTrue(response["X-Request-ID"])
        self.assertEqual(response["Cache-Control"], "no-store")


class LogoutRegressionTests(SessionTestBase):
    def test_garbage_authorization_header_no_longer_blocks_logout(self):
        """Old: the default authenticators rejected the bad bearer with 401 before the
        view ran, so the refresh cookie was never cleared."""
        for header in ("Bearer garbage", "Bearer a.b.c", "Basic Zm9vOmJhcg==", "Bearer "):
            with self.subTest(header=header):
                token = self.new_refresh()
                self.client.cookies[self.cookie] = token
                response = self.client.post(
                    reverse("logout"), {}, format="json", HTTP_AUTHORIZATION=header, **self.csrf()
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.cookies[self.cookie].value, "")
                self.assertEqual(response.cookies[self.cookie]["max-age"], 0)
                self.assertTrue(response["X-Request-ID"])
                # and the refresh token really is dead
                self.assertEqual(self.refresh(token).status_code, 401)

    def test_expired_access_token_no_longer_blocks_logout(self):
        access = AccessToken.for_user(self.user)
        access.set_exp(from_time=timezone.now() - timedelta(days=2), lifetime=timedelta(hours=1))
        token = self.new_refresh()
        self.client.cookies[self.cookie] = token
        response = self.client.post(
            reverse("logout"), {}, format="json", HTTP_AUTHORIZATION=f"Bearer {access}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies[self.cookie].value, "")
        self.assertEqual(self.refresh(token).status_code, 401)

    def test_logout_always_answers_200_and_clears_the_cookie(self):
        cases = {
            "no cookie": None,
            "garbage cookie": "garbage",
            "already blacklisted": "blacklisted",
        }
        for name, cookie in cases.items():
            with self.subTest(case=name):
                if cookie == "blacklisted":
                    cookie = self.new_refresh()
                    RefreshToken(cookie).blacklist()
                if cookie is None:
                    self.client.cookies.pop(self.cookie, None)
                else:
                    self.client.cookies[self.cookie] = cookie
                response = self.client.post(reverse("logout"), {}, format="json")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.cookies[self.cookie].value, "")

    def test_logout_survives_a_malformed_body_and_non_string_refresh(self):
        token = self.new_refresh()
        self.client.cookies[self.cookie] = token
        response = self.client.post(reverse("logout"), "{not json", content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.refresh(token).status_code, 401)  # cookie token was still blacklisted

        response = self.client.post(reverse("logout"), {"refresh": 42}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_logout_uses_the_refresh_token_to_clean_up_legacy_drf_tokens(self):
        Token.objects.create(user=self.user)
        self.client.cookies[self.cookie] = self.new_refresh()
        with self.assertLogs("account.auth", level="INFO") as cm:
            response = self.client.post(reverse("logout"), {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        event = auth_events(cm, "logout")[0]
        self.assertEqual((event["outcome"], event["stage"]), ("success", "success"))
        self.assertEqual(event["user_id"], self.user.pk)

    def test_blacklist_failure_is_swallowed_and_logged_at_debug(self):
        from unittest.mock import patch

        self.client.cookies[self.cookie] = self.new_refresh()
        with patch("account.views.RefreshToken.blacklist", side_effect=RuntimeError("db")):
            with self.assertLogs("account.auth", level="DEBUG") as cm:
                response = self.client.post(reverse("logout"), {}, format="json")
        self.assertEqual(response.status_code, 200)
        stages = [e["stage"] for e in auth_events(cm, "logout")]
        self.assertEqual(stages, ["blacklist_failed", "success"])

    def test_legacy_body_refresh_is_still_blacklisted(self):
        token = self.new_refresh()
        response = self.client.post(reverse("logout"), {"refresh": token}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.refresh(token).status_code, 401)
