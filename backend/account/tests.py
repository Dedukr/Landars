from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from .models import Address, CustomUser, Profile

User = get_user_model()


class CustomUserModelTest(TestCase):
    """Test cases for CustomUser model"""

    def setUp(self):
        """Set up test data"""
        self.user_data = {
            "name": "Test User",
            "email": "test@example.com",
            "password": "testpass123",
        }

    def test_create_user(self):
        """Test creating a regular user"""
        user = User.objects.create_user(**self.user_data)
        self.assertEqual(user.name, "Test User")
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser(self):
        """Test creating a superuser"""
        user = User.objects.create_superuser(
            name="Admin User", email="admin@example.com", password="adminpass123"
        )
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_active)

    def test_user_str_representation(self):
        """Test user string representation"""
        user = User.objects.create_user(**self.user_data)
        self.assertEqual(str(user), "Test User")

    def test_user_email_normalization(self):
        """Test that email is normalized"""
        user = User.objects.create_user(
            name="Test User", email="TEST@EXAMPLE.COM", password="testpass123"
        )
        self.assertEqual(user.email, "TEST@EXAMPLE.COM".lower())

    def test_user_without_email(self):
        """Test creating user without email"""
        user = User.objects.create_user(name="No Email User", password="testpass123")
        self.assertIsNone(user.email)

    def test_duplicate_email_raises_error(self):
        """Test that duplicate emails raise an error"""
        User.objects.create_user(**self.user_data)
        with self.assertRaises(ValueError):
            User.objects.create_user(
                name="Another User",
                email="test@example.com",
                password="testpass123",
            )

    def test_email_verification_default(self):
        """Test that email verification defaults to False"""
        user = User.objects.create_user(**self.user_data)
        self.assertFalse(user.is_email_verified)


class ProfileModelTest(TestCase):
    """Test cases for Profile model"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            name="Test User", email="test@example.com", password="testpass123"
        )

    def test_profile_creation(self):
        """Test that profile is created with user"""
        self.assertTrue(hasattr(self.user, "profile"))
        profile = self.user.profile
        self.assertIsNotNone(profile)

    def test_profile_str_representation(self):
        """Test profile string representation"""
        profile = self.user.profile
        self.assertEqual(str(profile), "Test User's Profile")


class AddressModelTest(TestCase):
    """Test cases for Address model"""

    def test_create_address(self):
        """Test creating an address"""
        address = Address.objects.create(
            address_line="123 Test Street",
            address_line2="Apt 4B",
            city="London",
            postal_code="SW1A 1AA",
        )
        self.assertEqual(address.address_line, "123 Test Street")
        self.assertEqual(address.city, "London")
        self.assertEqual(address.postal_code, "SW1A 1AA")

    def test_address_str_representation(self):
        """Test address string representation"""
        address = Address.objects.create(postal_code="SW1A 1AA")
        self.assertEqual(str(address), "SW1A 1AA")

    def test_address_without_postal_code(self):
        """Test address without postal code"""
        address = Address.objects.create()
        self.assertEqual(str(address), "No Address")
