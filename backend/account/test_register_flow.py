from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from account.email_validators import (
    is_disposable_email,
    is_major_email_provider,
    validate_email_comprehensive,
)
from account.models import CustomUser, EmailVerificationToken

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class RegisterFlowTests(TransactionTestCase):
    """
    TransactionTestCase so transaction.on_commit runs after register saves
    (TestCase wraps tests in an atomic block that never commits).
    """

    def setUp(self):
        self.client = APIClient()

    @patch("account.views.send_verification_email_task.delay")
    def test_register_happy_path_queues_email(self, mock_delay):
        mock_delay.return_value = None
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "newuser@example.com",
                "password": "SecurePass1",
                "first_name": "New",
                "surname": "User",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["email_queued"])
        self.assertFalse(response.data["email_sent"])
        mock_delay.assert_called_once()
        user = User.objects.get(email="newuser@example.com")
        self.assertFalse(user.is_email_verified)

    def test_register_duplicate_email_returns_400(self):
        User.objects.create_user(
            email="exists@example.com",
            password="SecurePass1",
            first_name="Existing",
            surname="User",
        )
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "exists@example.com",
                "password": "SecurePass1",
                "first_name": "Another",
                "surname": "User",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("already exists", response.data["error"].lower())

    @patch("account.views.send_verification_email_task.delay", side_effect=RuntimeError("broker down"))
    @patch("account.views.send_verification_email_task")
    def test_register_broker_down_still_201_without_sync_send(
        self, mock_task, _mock_delay
    ):
        """Broker failure must not block register or fall back to sync SES."""
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "fallback@example.com",
                "password": "SecurePass1",
                "first_name": "Fall",
                "surname": "Back",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["email_queued"])
        self.assertIn("Resend", response.data["message"])
        mock_task.assert_not_called()
        self.assertTrue(User.objects.filter(email="fallback@example.com").exists())

    @patch("account.views.send_verification_email_task.delay")
    def test_register_accepts_hotmail_and_outlook(self, mock_delay):
        """
        Hotmail/Outlook are major providers, not disposable.

        Safari 'Load failed' is a network/fetch failure — not disposable-email
        rejection (which returns structured JSON 400). This documents that
        Microsoft consumer domains are accepted by registration validation.
        """
        mock_delay.return_value = None
        for email in ("user@hotmail.com", "user@outlook.com"):
            with self.subTest(email=email):
                response = self.client.post(
                    "/api/auth/register/",
                    {
                        "email": email,
                        "password": "SecurePass1",
                        "first_name": "Ms",
                        "surname": "User",
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, 201, response.data)
                self.assertTrue(response.data["email_queued"])
                self.assertTrue(User.objects.filter(email=email).exists())


class MicrosoftEmailProviderValidationTests(TestCase):
    """Unit checks: hotmail/outlook are major, not disposable (Check A)."""

    def test_hotmail_and_outlook_are_major_not_disposable(self):
        for domain in ("hotmail.com", "outlook.com"):
            with self.subTest(domain=domain):
                self.assertTrue(is_major_email_provider(domain))
                self.assertFalse(is_disposable_email(domain))
                result = validate_email_comprehensive(f"customer@{domain}")
                self.assertTrue(result.is_valid, result.error)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class VerifyEmailAtomicTests(TransactionTestCase):
    """TransactionTestCase so on_commit confirmation enqueue runs in-test."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="verify@example.com",
            password="SecurePass1",
            first_name="Verify",
            surname="Me",
            is_email_verified=False,
        )
        self.token = EmailVerificationToken.objects.create(user=self.user)

    @patch("account.views.send_verification_confirmation_email_task.delay")
    def test_verify_email_marks_user_verified(self, mock_delay):
        mock_delay.return_value = None
        response = self.client.post(
            "/api/auth/verify-email/",
            {"token": self.token.token},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        mock_delay.assert_called_once_with(self.user.pk)

    @patch("account.views.send_verification_confirmation_email_task")
    @patch(
        "account.views.send_verification_confirmation_email_task.delay",
        side_effect=RuntimeError("broker down"),
    )
    def test_verify_email_does_not_sync_send_when_broker_down(
        self, _mock_delay, mock_task
    ):
        response = self.client.post(
            "/api/auth/verify-email/",
            {"token": self.token.token},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)
        mock_task.assert_not_called()


class WebsiteSignupMergeGuardTests(TestCase):
    @patch("account.merge_service.merge_users")
    def test_website_signup_skips_auto_merge(self, mock_merge):
        User.objects.create_user(
            email="website@example.com",
            password="SecurePass1",
            first_name="Web",
            surname="Signup",
            created_source=CustomUser.CREATED_SOURCE_WEBSITE,
        )
        mock_merge.assert_not_called()

    @patch("account.merge_service.merge_users")
    def test_admin_signup_still_triggers_merge(self, mock_merge):
        User.objects.create_user(
            email="admin@example.com",
            password="SecurePass1",
            first_name="Admin",
            surname="Created",
            created_source=CustomUser.CREATED_SOURCE_ADMIN,
        )
        mock_merge.assert_called_once()
