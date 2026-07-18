from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from .name_utils import split_legacy_name
from .order_names import require_customer_names
from .order_phone import require_customer_phone
from .phone_utils import is_valid_phone
from .merge_service import (
    merge_phones,
    merge_users,
    name_similarity,
    names_are_similar,
    normalize_name,
    select_canonical_user,
)
from .models import Address, CustomUser, Profile

User = get_user_model()


class CustomerNameOrderTest(TestCase):
    def test_require_customer_names_blocks_empty(self):
        user = User.objects.create_user(
            name="No Names",
            email="noname@example.com",
            password="pass",
        )
        response = require_customer_names(user)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 400)

    def test_require_customer_names_persists_from_request(self):
        user = User.objects.create_user(
            name="Legacy",
            email="legacy@example.com",
            password="pass",
        )
        response = require_customer_names(user, "Alice", "Smith")
        self.assertIsNone(response)
        user.refresh_from_db()
        self.assertEqual(user.first_name, "Alice")
        self.assertEqual(user.surname, "Smith")


class PhoneValidationTest(TestCase):
    def test_is_valid_phone(self):
        self.assertTrue(is_valid_phone("+44 7700 900123"))
        self.assertFalse(is_valid_phone("123"))
        self.assertFalse(is_valid_phone(""))

    def test_require_customer_phone_blocks_empty(self):
        user = User.objects.create_user(
            name="No Phone",
            email="nophone@example.com",
            password="pass",
        )
        Profile.objects.create(user=user, phone="")
        response = require_customer_phone(user)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 400)


class SplitLegacyNameTest(TestCase):
    def test_two_words_split(self):
        self.assertEqual(split_legacy_name("Alice Smith"), ("Alice", "Smith"))

    def test_single_word_goes_to_first_name(self):
        self.assertEqual(split_legacy_name("Madonna"), ("Madonna", None))

    def test_three_words_stay_in_first_name(self):
        self.assertEqual(
            split_legacy_name("Mary Jane Watson"), ("Mary Jane Watson", None)
        )


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
        self.assertEqual(user.first_name, "Test")
        self.assertEqual(user.surname, "User")
        self.assertEqual(user.get_display_name(), "Test User")
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
        # Our implementation lowercases both local and domain parts
        self.assertEqual(user.email, "test@example.com")

    def test_user_without_email(self):
        """Test creating user without email"""
        with self.assertRaises(ValueError):
            User.objects.create_user(name="No Email User", password="testpass123")

    def test_admin_form_updates_display_name_from_parts(self):
        """Changing first/surname in the admin form must update computed name."""
        from .forms import CustomUserForm

        user = User.objects.create_user(**self.user_data)
        form = CustomUserForm(
            data={
                "first_name": "José",
                "surname": "García",
                "email": user.email,
                "password": user.password,
                "is_email_verified": user.is_email_verified,
                "phone": "",
                "address_line": "10 Delivery Rd",
                "address_line2": "",
                "city": "London",
                "postal_code": "SW1A 1AA",
                "notes": "",
                "bill_use_delivery_address": True,
            },
            instance=user,
        )
        self.assertTrue(form.is_valid(), form.errors)
        # Admin calls save(commit=False) then save_model().
        updated = form.save(commit=False)
        updated.save()
        user.refresh_from_db()
        self.assertEqual(user.first_name, "José")
        self.assertEqual(user.surname, "García")
        self.assertEqual(user.name, "José García")
        self.assertEqual(user.get_display_name(), "José García")

    def test_admin_form_requires_delivery_address_fields(self):
        from .forms import CustomUserForm

        user = User.objects.create_user(**self.user_data)
        form = CustomUserForm(
            data={
                "first_name": "Julia",
                "surname": "Nova",
                "email": user.email,
                "password": user.password,
                "is_email_verified": user.is_email_verified,
                "phone": "",
                "address_line": "",
                "address_line2": "",
                "city": "",
                "postal_code": "",
                "notes": "",
                "bill_use_delivery_address": True,
            },
            instance=user,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("address_line", form.errors)
        self.assertIn("city", form.errors)
        self.assertIn("postal_code", form.errors)

    def test_admin_form_rejects_non_latin_names(self):
        from .forms import CustomUserForm

        user = User.objects.create_user(**self.user_data)
        form = CustomUserForm(
            data={
                "first_name": "Юлія",
                "surname": "Нова",
                "email": user.email,
                "password": user.password,
                "is_email_verified": user.is_email_verified,
                "phone": "",
                "address_line": "10 Delivery Rd",
                "address_line2": "",
                "city": "London",
                "postal_code": "SW1A 1AA",
                "notes": "",
                "bill_use_delivery_address": True,
            },
            instance=user,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("first_name", form.errors)
        self.assertIn("surname", form.errors)

    def test_admin_form_rejects_non_latin_address(self):
        from .forms import CustomUserForm

        user = User.objects.create_user(**self.user_data)
        form = CustomUserForm(
            data={
                "first_name": "Julia",
                "surname": "Nova",
                "email": user.email,
                "password": user.password,
                "is_email_verified": user.is_email_verified,
                "phone": "",
                "address_line": "Вулиця Шевченка 1",
                "address_line2": "",
                "city": "Київ",
                "postal_code": "SW1A 1AA",
                "notes": "",
                "bill_use_delivery_address": True,
            },
            instance=user,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("address_line", form.errors)
        self.assertIn("city", form.errors)

    def test_admin_form_requires_complete_billing_street_when_partial(self):
        from .forms import CustomUserForm

        user = User.objects.create_user(**self.user_data)
        form = CustomUserForm(
            data={
                "first_name": user.first_name,
                "surname": user.surname,
                "email": user.email,
                "password": user.password,
                "is_email_verified": user.is_email_verified,
                "phone": "",
                "address_line": "10 Delivery Rd",
                "address_line2": "",
                "city": "London",
                "postal_code": "SW1A 1AA",
                "notes": "",
                "bill_company_name": "",
                "bill_contact_name": "",
                "bill_address_line": "",
                "bill_address_line2": "",
                "bill_city": "London",
                "bill_postal_code": "SW1A 1AA",
            },
            instance=user,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("bill_address_line", form.errors)

    def test_admin_form_accepts_complete_billing_address(self):
        from .forms import CustomUserForm

        user = User.objects.create_user(**self.user_data)
        form = CustomUserForm(
            data={
                "first_name": user.first_name,
                "surname": user.surname,
                "email": user.email,
                "password": user.password,
                "is_email_verified": user.is_email_verified,
                "phone": "",
                "address_line": "10 Delivery Rd",
                "address_line2": "",
                "city": "London",
                "postal_code": "SW1A 1AA",
                "notes": "",
                "bill_company_name": "Acme Ltd",
                "bill_contact_name": "",
                "bill_address_line": "1 Billing St",
                "bill_address_line2": "Suite 2",
                "bill_city": "London",
                "bill_postal_code": "SW1A 1AA",
            },
            instance=user,
        )
        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        user.profile.refresh_from_db()
        self.assertIsNotNone(user.profile.billing_address)
        self.assertEqual(user.profile.billing_address.address_line2, "Suite 2")

    def test_profile_billing_address_empty_without_saved_row(self):
        user = User.objects.create_user(**self.user_data)
        profile = Profile.objects.create(user=user)
        delivery = Address.objects.create(
            address_line="10 Delivery Rd",
            address_line2="Flat 2",
            city="London",
            postal_code="SW1A 1AA",
        )
        profile.address = delivery
        profile.bill_use_delivery_address = True
        profile.save()

        # When using delivery as billing, street fields come from the delivery address.
        self.assertEqual(
            profile.billing_address_fields()["address_line"],
            "10 Delivery Rd",
        )

    def test_profile_separate_billing_address(self):
        from .models import BillingAddress

        user = User.objects.create_user(**self.user_data)
        billing = BillingAddress.objects.create(
            customer=user,
            address_line="1 Billing St",
            city="Manchester",
            postal_code="M1 1AA",
        )
        profile = Profile.objects.create(
            user=user,
            billing_address=billing,
            bill_use_delivery_address=False,
        )

        self.assertEqual(
            profile.billing_address_fields()["address_line"],
            "1 Billing St",
        )

    def test_profile_billing_includes_company_and_contact(self):
        from .models import BillingAddress

        user = User.objects.create_user(**self.user_data)
        billing = BillingAddress.objects.create(
            customer=user,
            company_name="Acme Ltd",
            contact_name="Jane Doe",
            address_line="1 Billing St",
            city="Manchester",
            postal_code="M1 1AA",
        )
        profile = Profile.objects.create(
            user=user,
            billing_address=billing,
            bill_use_delivery_address=False,
        )
        fields = profile.billing_address_fields()
        self.assertEqual(fields["company_name"], "Acme Ltd")
        self.assertEqual(fields["contact_name"], "Jane Doe")
        self.assertEqual(fields["address_line"], "1 Billing St")


class ProfileBillingValidationApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            name="Bill User",
            email="billuser@example.com",
            password="pass12345",
        )
        Profile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def test_partial_billing_street_requires_complete_fields(self):
        response = self.client.put(
            "/api/auth/profile/update/",
            {
                "first_name": "Bill",
                "surname": "User",
                "billing_address": {
                    "bill_company_name": "",
                    "bill_contact_name": "",
                    "bill_address_line": "1 Billing St",
                    "bill_address_line2": "",
                    "bill_city": "",
                    "bill_postal_code": "M1 1AA",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("errors", response.data)
        self.assertIn("bill_city", response.data["errors"])

    def test_billing_accepts_complete_address(self):
        response = self.client.put(
            "/api/auth/profile/update/",
            {
                "first_name": "Bill",
                "surname": "User",
                "billing_address": {
                    "bill_company_name": "Acme",
                    "bill_contact_name": "",
                    "bill_address_line": "1 Billing St",
                    "bill_address_line2": "",
                    "bill_city": "Manchester",
                    "bill_postal_code": "M1 1AA",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertIsNotNone(self.user.profile.billing_address)
        self.assertEqual(
            self.user.profile.billing_address.address_line, "1 Billing St"
        )
        self.assertEqual(self.user.profile.billing_address.city, "Manchester")


class CustomUserEmailTests(TestCase):
    def setUp(self):
        self.user_data = {
            "name": "Test User",
            "email": "test@example.com",
            "password": "testpass123",
        }

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
        """Test that profile can be created for user"""
        # Profile is not automatically created, so we create it
        profile = Profile.objects.create(user=self.user)
        self.assertTrue(hasattr(self.user, "profile"))
        self.assertIsNotNone(self.user.profile)
        self.assertEqual(self.user.profile, profile)

    def test_profile_str_representation(self):
        """Test profile string representation"""
        # Profile needs to be created explicitly
        profile = Profile.objects.create(user=self.user)
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


# ---------------------------------------------------------------------------
# Merge service — helper unit tests
# ---------------------------------------------------------------------------


class NormalizeNameTest(TestCase):
    def test_lowercase(self):
        self.assertEqual(normalize_name("John Smith"), "john smith")

    def test_strips_whitespace(self):
        self.assertEqual(normalize_name("  Jane  Doe  "), "jane doe")

    def test_collapses_inner_spaces(self):
        self.assertEqual(normalize_name("Alice  Bob"), "alice bob")

    def test_empty_string(self):
        self.assertEqual(normalize_name(""), "")

    def test_none_like_empty(self):
        self.assertEqual(normalize_name(None), "")


class NameSimilarityTest(TestCase):
    def test_identical_names(self):
        self.assertAlmostEqual(name_similarity("John Smith", "John Smith"), 1.0)

    def test_case_insensitive(self):
        self.assertAlmostEqual(name_similarity("john smith", "JOHN SMITH"), 1.0)

    def test_similar_names(self):
        ratio = name_similarity("John Smit", "John Smith")
        self.assertGreater(ratio, 0.9)

    def test_different_names(self):
        ratio = name_similarity("Alice", "Bob")
        self.assertLess(ratio, 0.92)

    def test_empty_names(self):
        self.assertEqual(name_similarity("", "John"), 0.0)

    def test_names_are_similar_exact(self):
        self.assertTrue(names_are_similar("John Smith", "john smith"))

    def test_names_are_similar_above_threshold(self):
        self.assertTrue(names_are_similar("John Smit", "John Smith"))

    def test_names_are_not_similar(self):
        self.assertFalse(names_are_similar("Alice Johnson", "Bob Williams"))


class MergePhonesTest(TestCase):
    def test_no_conflict(self):
        self.assertEqual(merge_phones("07111111111", ""), "07111111111")

    def test_different_phones_merged(self):
        result = merge_phones("07111111111", "07222222222")
        self.assertIn("07111111111", result)
        self.assertIn("07222222222", result)

    def test_deduplicates_same_phone(self):
        result = merge_phones("07111111111", "07111111111")
        self.assertEqual(result.count("07111111111"), 1)

    def test_main_empty_dup_has_value(self):
        self.assertEqual(merge_phones("", "07333333333"), "07333333333")

    def test_both_empty(self):
        self.assertEqual(merge_phones("", ""), "")

    def test_comma_separated_lists(self):
        result = merge_phones("07111111111, 07222222222", "07222222222, 07333333333")
        parts = [p.strip() for p in result.split(",")]
        self.assertIn("07111111111", parts)
        self.assertIn("07222222222", parts)
        self.assertIn("07333333333", parts)
        self.assertEqual(parts.count("07222222222"), 1)


class SelectCanonicalUserTest(TestCase):
    def _make_user(self, name, email=None):
        if email:
            return User.objects.create_user(name=name, email=email)
        # Create a user without email without using the manager (manager enforces email)
        from django.db.models.signals import post_save

        from account.signals import trigger_user_merge_on_create

        post_save.disconnect(trigger_user_merge_on_create, sender=User)
        try:
            user = User(name=name, email=None)
            user.set_unusable_password()
            user.save()
            return user
        finally:
            post_save.connect(trigger_user_merge_on_create, sender=User)

    def test_user_with_email_is_main(self):
        user_with_email = self._make_user("Alice", email="alice@example.com")
        user_no_email = self._make_user("Alice No Email")
        main, dup = select_canonical_user(user_no_email, user_with_email)
        self.assertEqual(main, user_with_email)
        self.assertEqual(dup, user_no_email)

    def test_website_user_preferred_over_admin(self):
        website = User(pk=1, name="Same", email="same@example.com", created_source="website")
        admin = User(pk=2, name="Same", email="same@example.com", created_source="admin")
        main, dup = select_canonical_user(admin, website)
        self.assertEqual(main.pk, 1)
        self.assertEqual(dup.pk, 2)

    def test_both_same_email_older_is_main(self):
        """
        When both users share the same e-mail (same-email edge-case is tested
        at function level without a DB unique-constraint violation).
        """
        # Use unsaved model instances to avoid the unique-email DB constraint.
        user_a = User(pk=1, name="Alice A", email="same@example.com")
        user_b = User(pk=2, name="Alice B", email="same@example.com")
        # user_a has the lower pk → it should be the main record.
        main, dup = select_canonical_user(user_a, user_b)
        self.assertEqual(main.pk, 1)
        self.assertEqual(dup.pk, 2)

    def test_different_emails_returns_none(self):
        user_a = self._make_user("Alice", email="alice@example.com")
        user_b = self._make_user("Alicea", email="alicea@example.com")
        main, dup = select_canonical_user(user_a, user_b)
        self.assertIsNone(main)
        self.assertIsNone(dup)

    def test_neither_has_email_older_is_main(self):
        user_a = self._make_user("NoEmail A")
        user_b = self._make_user("NoEmail B")
        main, dup = select_canonical_user(user_a, user_b)
        self.assertEqual(main.pk, user_a.pk)


# ---------------------------------------------------------------------------
# Merge service — integration tests
# ---------------------------------------------------------------------------


class MergeUsersIntegrationTest(TestCase):
    """
    Tests that exercise the full merge_users() function directly
    (signal is bypassed by calling merge_users() manually after user creation
    to avoid double-merge in test scenarios).
    """

    def _make_user(self, name, email=None, password=None):
        """Create a user; allow email=None (manager enforces email, model allows null)."""
        from django.db.models.signals import post_save

        from account.signals import trigger_user_merge_on_create

        post_save.disconnect(trigger_user_merge_on_create, sender=User)
        try:
            if email:
                return User.objects.create_user(name=name, email=email, password=password)
            user = User(name=name, email=None)
            if password:
                user.set_password(password)
            else:
                user.set_unusable_password()
            user.save()
            return user
        finally:
            post_save.connect(trigger_user_merge_on_create, sender=User)

    def _make_profile(self, user, phone=None, notes=None, address=None):
        return Profile.objects.create(user=user, phone=phone, notes=notes, address=address)

    def _make_address(self, **kwargs):
        return Address.objects.create(**kwargs)

    # ── Basic merge scenarios ───────────────────────────────────────────────

    def test_exact_same_name_email_vs_no_email_merges_into_email_user(self):
        """Exact normalised-name match: user with email becomes main."""
        old_user = self._make_user("John Smith", email="john@example.com")
        new_user = self._make_user("john smith")  # same name, different case, no email

        merge_users(new_user)

        old_user.refresh_from_db()
        self.assertTrue(old_user.is_active)
        self.assertFalse(User.objects.filter(pk=new_user.pk).exists())  # duplicate deleted

    def test_similar_name_above_threshold_merges(self):
        """Name similarity ≥ threshold triggers a merge."""
        old_user = self._make_user("John Smit", email="j@example.com")
        new_user = self._make_user("John Smith")

        merge_users(new_user)

        self.assertFalse(User.objects.filter(pk=new_user.pk).exists())

    def test_different_names_no_merge(self):
        """Names below threshold: no merge, both users remain active."""
        old_user = self._make_user("Alice Johnson", email="a@example.com")
        new_user = self._make_user("Bob Williams")

        merge_users(new_user)

        old_user.refresh_from_db()
        new_user.refresh_from_db()
        self.assertTrue(old_user.is_active)
        self.assertTrue(new_user.is_active)

    def test_both_different_emails_no_merge(self):
        """Both users have different e-mails: merge is skipped."""
        old_user = self._make_user("Jane Doe", email="jane@example.com")
        new_user = self._make_user("jane doe", email="jane2@example.com")

        merge_users(new_user)

        old_user.refresh_from_db()
        new_user.refresh_from_db()
        self.assertTrue(old_user.is_active)
        self.assertTrue(new_user.is_active)

    # ── Name conflict ───────────────────────────────────────────────────────

    def test_main_user_keeps_its_name_after_merge(self):
        """After merge the canonical user retains its own name."""
        main = self._make_user("Alice Smith", email="alice@example.com")
        dup = self._make_user("alice smith")

        merge_users(dup)

        main.refresh_from_db()
        self.assertEqual(main.name, "Alice Smith")
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    # ── Address conflict ────────────────────────────────────────────────────

    def test_address_copied_when_main_has_no_address(self):
        """Main user has no address but dup does: a copy is made for main."""
        main = self._make_user("Bob Jones", email="bob@example.com")
        dup = self._make_user("bob jones")

        addr = self._make_address(address_line="10 Street", city="London", postal_code="E1 1AA")
        self._make_profile(main)
        self._make_profile(dup, address=addr)

        merge_users(dup)

        main_profile = Profile.objects.get(user=main)
        self.assertIsNotNone(main_profile.address)
        self.assertEqual(main_profile.address.address_line, "10 Street")

    def test_address_conflict_keeps_main_address(self):
        """Both users have addresses: main's address is kept unchanged."""
        main = self._make_user("Carol Davis", email="carol@example.com")
        dup = self._make_user("carol davis")

        main_addr = self._make_address(address_line="1 Main St", city="Bristol")
        dup_addr = self._make_address(address_line="9 Dup St", city="Manchester")
        self._make_profile(main, address=main_addr)
        self._make_profile(dup, address=dup_addr)

        merge_users(dup)

        main_addr.refresh_from_db()
        self.assertEqual(main_addr.address_line, "1 Main St")

    # ── Phone merging ───────────────────────────────────────────────────────

    def test_phone_conflict_results_in_merged_string(self):
        """Both users have phones: result is comma-joined unique numbers."""
        main = self._make_user("Dave Evans", email="dave@example.com")
        dup = self._make_user("dave evans")

        self._make_profile(main, phone="07111111111")
        self._make_profile(dup, phone="07222222222")

        merge_users(dup)

        main_profile = Profile.objects.get(user=main)
        self.assertIn("07111111111", main_profile.phone)
        self.assertIn("07222222222", main_profile.phone)
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    def test_phone_only_on_dup_copied_to_main(self):
        """Main has no phone; dup's phone is copied across."""
        main = self._make_user("Eve Foster", email="eve@example.com")
        dup = self._make_user("eve foster")

        self._make_profile(main)
        self._make_profile(dup, phone="07333333333")

        merge_users(dup)

        main_profile = Profile.objects.get(user=main)
        self.assertEqual(main_profile.phone, "07333333333")
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    # ── Empty-field filling ─────────────────────────────────────────────────

    def test_empty_notes_on_main_filled_from_dup(self):
        """Main has no notes: dup's notes are copied."""
        main = self._make_user("Frank Green", email="frank@example.com")
        dup = self._make_user("frank green")

        self._make_profile(main)
        self._make_profile(dup, notes="VIP customer")

        merge_users(dup)

        main_profile = Profile.objects.get(user=main)
        self.assertEqual(main_profile.notes, "VIP customer")
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    def test_is_email_verified_copied_from_dup_to_main(self):
        """Main is not email-verified but dup is: flag is copied."""
        main = self._make_user("Grace Hill", email="grace@example.com")
        dup = self._make_user("grace hill")
        User.objects.filter(pk=dup.pk).update(is_email_verified=True)
        dup.refresh_from_db()

        merge_users(dup)

        main.refresh_from_db()
        self.assertTrue(main.is_email_verified)
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    # ── Related objects ─────────────────────────────────────────────────────

    def test_orders_reassigned_to_main_user(self):
        """Orders belonging to dup are moved to main after merge."""
        from api.models import Order

        main = self._make_user("Henry Ives", email="henry@example.com")
        dup = self._make_user("henry ives")

        order = Order.objects.create(customer=dup, source="admin")

        merge_users(dup)

        order.refresh_from_db()
        self.assertEqual(order.customer, main)
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    def test_profile_reassigned_when_main_has_no_profile(self):
        """Dup's profile is reassigned to main when main has none."""
        main = self._make_user("Iris Jones", email="iris@example.com")
        dup = self._make_user("iris jones")

        profile = self._make_profile(dup, phone="07444444444")

        merge_users(dup)

        profile.refresh_from_db()
        self.assertEqual(profile.user, main)
        self.assertFalse(User.objects.filter(pk=dup.pk).exists())

    # ── Signal trigger ──────────────────────────────────────────────────────

    def test_signal_triggers_on_user_creation(self):
        """
        Creating a user via the ORM triggers the post_save signal which calls
        merge_users().  Verify the duplicate is deactivated automatically.
        """
        existing = self._make_user("Signal Test User", email="signal@example.com")
        # Creating a second user with a normalised-identical name should
        # trigger the signal, which will deactivate the new user (it has no
        # email, so the older user with email is main).
        # Manager enforces email; create a no-email user via model save to exercise signal.
        new_user = User(name="signal test user", email=None)
        new_user.set_unusable_password()
        new_user.save()

        existing.refresh_from_db()

        self.assertFalse(User.objects.filter(pk=new_user.pk).exists())
        self.assertTrue(existing.is_active)

    # ── Safety: no IntegrityError ───────────────────────────────────────────

    def test_no_integrity_error_when_email_already_exists(self):
        """Merge with e-mail on main must not attempt to save dup's null email."""
        main = self._make_user("Jack King", email="jack@example.com")
        dup = self._make_user("jack king")

        # Should complete without raising IntegrityError
        try:
            merge_users(dup)
        except Exception as exc:
            self.fail(f"merge_users raised an exception: {exc}")

    # ── No infinite recursion ───────────────────────────────────────────────

    def test_no_infinite_recursion_during_merge(self):
        """
        merge_users must not re-trigger itself.  If it did, the DB call count
        would grow unboundedly; we just verify it completes without error.
        """
        existing = self._make_user("Loop User", email="loop@example.com")
        new_user = self._make_user("loop user")

        try:
            merge_users(new_user)
        except RecursionError:
            self.fail("merge_users caused infinite recursion")
