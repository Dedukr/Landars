from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from account.models import CustomUser, EmailVerificationToken

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class RegisterFlowTests(TestCase):
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
    def test_register_falls_back_to_sync_when_broker_down(self, mock_task, _mock_delay):
        mock_task.return_value = None
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
        self.assertTrue(response.data["email_queued"])


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class VerifyEmailAtomicTests(TestCase):
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
