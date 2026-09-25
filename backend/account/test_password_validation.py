"""Password strength rules via the real CustomPasswordValidator / validate_password."""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, TestCase, override_settings

from account.models import CustomUser
from account.validators import CustomPasswordValidator

User = CustomUser

VALID = "SecurePass1"


class CustomPasswordValidatorUnitTests(SimpleTestCase):
    def setUp(self):
        self.validator = CustomPasswordValidator()

    def test_too_short_is_rejected(self):
        with self.assertRaises(ValidationError) as cm:
            self.validator.validate("Ab1")
        self.assertEqual(cm.exception.code, "password_too_short")

    def test_letters_only_is_rejected(self):
        with self.assertRaises(ValidationError) as cm:
            self.validator.validate("abcdefgh")
        self.assertEqual(cm.exception.code, "password_no_numbers")

    def test_digits_only_is_rejected(self):
        with self.assertRaises(ValidationError) as cm:
            self.validator.validate("12345678")
        self.assertEqual(cm.exception.code, "password_no_letters")

    def test_valid_synthetic_password_passes_custom_validator(self):
        self.validator.validate(VALID)  # no raise

    def test_validate_password_rejects_the_same_weak_shapes(self):
        for weak in ("short1a", "abcdefgh", "12345678"):
            with self.subTest(weak=weak):
                with self.assertRaises(ValidationError):
                    validate_password(weak)

    def test_validate_password_accepts_secure_pass1(self):
        validate_password(VALID)  # no raise


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class PasswordHashingSuccessTests(TestCase):
    def test_create_user_hashes_and_check_password_verifies(self):
        user = User.objects.create_user(
            email="pw.valid@example.com",
            password=VALID,
            first_name="Pw",
            surname="Valid",
        )
        self.assertTrue(user.check_password(VALID))
        self.assertFalse(user.check_password("WrongPass9"))
        self.assertNotEqual(user.password, VALID)

    def test_set_password_hashes_and_check_password_verifies(self):
        user = User.objects.create_user(
            email="pw.set@example.com",
            password=VALID,
            first_name="Pw",
            surname="Set",
        )
        user.set_password("BrandNewPass9")
        user.save(update_fields=["password"])
        user.refresh_from_db()
        self.assertTrue(user.check_password("BrandNewPass9"))
        self.assertFalse(user.check_password(VALID))
        self.assertNotEqual(user.password, "BrandNewPass9")
