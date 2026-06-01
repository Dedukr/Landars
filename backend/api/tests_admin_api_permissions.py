from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from account.models import CustomUser


class AdminDashboardPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/dashboard/summary/"

    def test_anonymous_user_cannot_access_dashboard_summary(self):
        response = self.client.get(self.url)
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_normal_user_cannot_access_dashboard_summary(self):
        user = CustomUser.objects.create_user(
            name="Normal User",
            email="user@example.com",
            password="testpass123",
            is_staff=False,
        )
        self.client.force_authenticate(user=user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_user_can_access_dashboard_summary(self):
        user = CustomUser.objects.create_user(
            name="Staff User",
            email="staff@example.com",
            password="testpass123",
            is_staff=True,
        )
        self.client.force_authenticate(user=user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_orders", response.data)
        self.assertIn("total_products", response.data)
