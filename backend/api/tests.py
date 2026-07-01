from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


# ── Existing smoke tests ───────────────────────────────────────────────────

class APITestCase(TestCase):
    """Base test case for API tests"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            name="Test User", email="test@example.com", password="testpass123"
        )

    def authenticate_user(self):
        self.client.force_authenticate(user=self.user)


class ProductAPITest(APITestCase):
    def test_products_list_endpoint_exists(self):
        response = self.client.get("/api/products/")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


class CategoryAPITest(APITestCase):
    def test_categories_list_endpoint_exists(self):
        response = self.client.get("/api/categories/")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


class CartAPITest(APITestCase):
    def test_cart_endpoint_requires_authentication(self):
        response = self.client.get("/api/cart/")
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_authenticated_cart_access(self):
        self.authenticate_user()
        response = self.client.get("/api/cart/")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


class WishlistAPITest(APITestCase):
    def test_wishlist_endpoint_requires_authentication(self):
        response = self.client.get("/api/wishlist/")
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_authenticated_wishlist_access(self):
        self.authenticate_user()
        response = self.client.get("/api/wishlist/")
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])


# ── Review test suite ──────────────────────────────────────────────────────
#
# Coverage:
#   ✓ Anonymous user cannot submit shop review
#   ✓ Authenticated user without orders cannot submit shop review
#   ✓ Authenticated user with order can submit shop review
#   ✓ Duplicate shop review is blocked (one per user)
#   ✓ Client cannot inject product ID on shop-review endpoint
#   ✓ comment is required; rating is required
#   ✓ Product reviews still work (GET + POST)
#   ✓ Unapproved reviews hidden; approved reviews visible
#   ✓ Admin can approve, feature and reject reviews
#   ✓ Highlighted endpoint returns both shop and product reviews
#   ✓ Private data (email, user PK) never appears in public responses
#   ✓ shop/me/ status endpoint reflects correct eligibility state
#
# URL constants
_SHOP_URL = "/api/reviews/shop/"
_SHOP_ME_URL = "/api/reviews/shop/me/"
_HIGHLIGHTS_URL = "/api/reviews/highlights/"


class _ReviewFixtures(TestCase):
    """
    Shared, read-only class-level fixtures for all review test classes.

    Rule: never mutate cls.* objects inside a test method — create
    per-test objects with setUp() or directly inside the test.
    Each test method is wrapped in a savepoint that rolls back DB writes,
    so in-test object creation is fully isolated between tests.
    """

    @classmethod
    def setUpTestData(cls):
        from api.models import Order, Product

        cls.user_no_order = User.objects.create_user(
            name="No Order", email="noorder@reviews.test", password="x"
        )
        cls.user_with_order = User.objects.create_user(
            name="Has Order", email="hasorder@reviews.test", password="x"
        )
        cls.staff_user = User.objects.create_user(
            name="Staff", email="staff@reviews.test", password="x",
            is_staff=True, is_superuser=True,
        )
        cls.product = Product.objects.create(
            name="Varenyky Test", base_price=Decimal("4.99"), active=True
        )
        Order.objects.create(customer=cls.user_with_order)

    def setUp(self):
        self.client = APIClient()


# ── 1. Shop review permissions ─────────────────────────────────────────────

class ShopReviewPermissionTest(_ReviewFixtures):
    """Tests for POST /api/reviews/shop/ permission rules."""

    _VALID = {"rating": 5, "comment": "Great shop!", "title": "Love it"}

    def test_anonymous_cannot_submit_review(self):
        """Anonymous POST → 401 Unauthorized."""
        r = self.client.post(_SHOP_URL, self._VALID, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_without_order_cannot_submit(self):
        """User with no orders → 403 Forbidden with descriptive error."""
        self.client.force_authenticate(user=self.user_no_order)
        r = self.client.post(_SHOP_URL, self._VALID, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("order", r.data["error"].lower())

    def test_authenticated_user_with_order_can_submit(self):
        """User with at least one order → 201 Created with correct shape."""
        self.client.force_authenticate(user=self.user_with_order)
        r = self.client.post(_SHOP_URL, self._VALID, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.data["rating"], 5)
        self.assertEqual(r.data["review_type"], "shop")
        self.assertIsNone(r.data["product"])

    def test_duplicate_shop_review_is_blocked(self):
        """Second shop review from the same user → 400 with friendly message."""
        from api.models import Order
        dup_user = User.objects.create_user(
            name="Dup", email="dup@reviews.test", password="x"
        )
        Order.objects.create(customer=dup_user)
        self.client.force_authenticate(user=dup_user)
        payload = {"rating": 5, "comment": "First!"}
        r1 = self.client.post(_SHOP_URL, payload, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        r2 = self.client.post(_SHOP_URL, payload, format="json")
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already", r2.data["error"].lower())

    def test_client_cannot_inject_product_id(self):
        """Passing a product ID in the payload is silently ignored; review stays a shop review."""
        self.client.force_authenticate(user=self.user_with_order)
        payload = {**self._VALID, "product": self.product.pk}
        r = self.client.post(_SHOP_URL, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(r.data["product"])
        self.assertEqual(r.data["review_type"], "shop")

    def test_comment_is_required(self):
        """Blank comment → 400 with field error."""
        self.client.force_authenticate(user=self.user_with_order)
        r = self.client.post(_SHOP_URL, {"rating": 5, "comment": "   "}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("comment", r.data)

    def test_rating_is_required(self):
        """Missing rating → 400."""
        self.client.force_authenticate(user=self.user_with_order)
        r = self.client.post(_SHOP_URL, {"comment": "No rating provided"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rating_out_of_range_rejected(self):
        """rating=6 or rating=0 → 400."""
        self.client.force_authenticate(user=self.user_with_order)
        for bad_rating in (0, 6):
            r = self.client.post(
                _SHOP_URL, {"rating": bad_rating, "comment": "Bad rating"}, format="json"
            )
            self.assertEqual(
                r.status_code, status.HTTP_400_BAD_REQUEST,
                msg=f"Expected 400 for rating={bad_rating}",
            )

    def test_public_can_list_shop_reviews(self):
        """GET /api/reviews/shop/ is public — no auth required."""
        r = self.client.get(_SHOP_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIsInstance(r.data, list)


# ── 2. Product review backward-compatibility ───────────────────────────────

class ProductReviewTest(_ReviewFixtures):
    """Existing product reviews must continue to work after the model refactor."""

    def _url(self):
        return f"/api/products/{self.product.pk}/reviews/"

    def test_public_can_view_product_reviews(self):
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIsInstance(r.data, list)

    def test_anonymous_cannot_create_product_review(self):
        r = self.client.post(self._url(), {"rating": 5, "comment": "Anon"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_create_product_review(self):
        """No order required for product reviews — any authenticated user can review."""
        self.client.force_authenticate(user=self.user_no_order)
        r = self.client.post(self._url(), {"rating": 4, "comment": "Tasty!"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.data["review_type"], "product")
        self.assertEqual(r.data["product"], self.product.pk)

    def test_inactive_product_returns_404_for_reviews(self):
        from api.models import Product
        inactive = Product.objects.create(
            name="Inactive", base_price=Decimal("1.00"), active=False
        )
        r = self.client.get(f"/api/products/{inactive.pk}/reviews/")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_unapproved_product_review_hidden(self):
        from api.models import ProductReview
        ProductReview.objects.create(
            product=self.product, user=self.user_with_order,
            rating=1, comment="Hidden review", is_approved=False,
        )
        r = self.client.get(self._url())
        comments = [item["comment"] for item in r.data]
        self.assertNotIn("Hidden review", comments)

    def test_approved_product_review_visible(self):
        from api.models import ProductReview
        ProductReview.objects.create(
            product=self.product, user=self.user_with_order,
            rating=5, comment="Visible review", is_approved=True,
        )
        r = self.client.get(self._url())
        comments = [item["comment"] for item in r.data]
        self.assertIn("Visible review", comments)


# ── 3. Highlighted reviews endpoint ────────────────────────────────────────

class ReviewHighlightsTest(_ReviewFixtures):
    """Tests for GET /api/reviews/highlights/"""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from api.models import ProductReview
        cls.shop_review = ProductReview.objects.create(
            user=cls.user_with_order, product=None,
            rating=5, comment="Shop highlight", is_approved=True,
        )
        cls.product_review = ProductReview.objects.create(
            user=cls.user_with_order, product=cls.product,
            rating=5, comment="Product highlight", is_approved=True,
        )
        cls.featured_review = ProductReview.objects.create(
            user=cls.staff_user, product=cls.product,
            rating=4, comment="Featured review", is_approved=True, is_featured=True,
        )

    def test_anonymous_can_access_highlights(self):
        r = self.client.get(_HIGHLIGHTS_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_highlights_include_both_shop_and_product_reviews(self):
        """The curated list must contain at least one shop and one product review."""
        r = self.client.get(_HIGHLIGHTS_URL)
        types = {item["review_type"] for item in r.data}
        self.assertIn("shop", types, "Highlights must include shop reviews")
        self.assertIn("product", types, "Highlights must include product reviews")

    def test_featured_review_always_included(self):
        r = self.client.get(_HIGHLIGHTS_URL)
        featured_ids = {item["id"] for item in r.data if item["is_featured"]}
        self.assertIn(self.featured_review.pk, featured_ids)

    def test_unapproved_review_excluded_from_highlights(self):
        from api.models import ProductReview
        hidden = ProductReview.objects.create(
            user=self.staff_user,
            product=self.product, rating=5, comment="Should not show",
            is_approved=False,
        )
        r = self.client.get(_HIGHLIGHTS_URL)
        ids = {item["id"] for item in r.data}
        self.assertNotIn(hidden.pk, ids)

    def test_limit_parameter_caps_results(self):
        r = self.client.get(_HIGHLIGHTS_URL + "?limit=1")
        self.assertLessEqual(len(r.data), 1)

    def test_limit_parameter_invalid_value_defaults_gracefully(self):
        r = self.client.get(_HIGHLIGHTS_URL + "?limit=abc")
        self.assertEqual(r.status_code, status.HTTP_200_OK)


# ── 4. Privacy — no PII in public responses ────────────────────────────────

class ReviewPrivacyTest(_ReviewFixtures):
    """Verify that private customer data never leaks through public endpoints."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from api.models import ProductReview
        ProductReview.objects.create(
            user=cls.user_with_order, product=None,
            rating=5, comment="Privacy check", is_approved=True,
        )
        ProductReview.objects.create(
            user=cls.user_with_order, product=cls.product,
            rating=5, comment="Product privacy", is_approved=True,
        )

    def _assert_no_email(self, data):
        """Assert none of the test email addresses appear anywhere in the serialized output."""
        payload = str(data)
        for email in ("noorder@reviews.test", "hasorder@reviews.test", "staff@reviews.test"):
            self.assertNotIn(email, payload, f"Email {email} leaked into public response")

    def test_email_not_exposed_in_shop_reviews(self):
        r = self.client.get(_SHOP_URL)
        self._assert_no_email(r.data)

    def test_email_not_exposed_in_highlights(self):
        r = self.client.get(_HIGHLIGHTS_URL)
        self._assert_no_email(r.data)

    def test_email_not_exposed_in_product_reviews(self):
        r = self.client.get(f"/api/products/{self.product.pk}/reviews/")
        self._assert_no_email(r.data)

    def test_user_pk_not_in_public_shop_review(self):
        """ReviewPublicSerializer must not include the raw ``user`` integer PK."""
        r = self.client.get(_SHOP_URL)
        for item in r.data:
            self.assertNotIn("user", item.keys(),
                             "Raw user PK must not be exposed in public review response")

    def test_user_name_never_contains_at_sign(self):
        """user_name is first-name only — must never look like an email address."""
        for url in (_SHOP_URL, _HIGHLIGHTS_URL):
            r = self.client.get(url)
            for item in r.data:
                self.assertNotIn("@", item["user_name"],
                                 f"user_name looks like an email in {url}: {item['user_name']!r}")

    def test_user_name_fallback_is_verified_customer(self):
        """A user with no first_name and no legacy name falls back to 'Verified Customer'."""
        from api.serializers import _get_safe_display_name
        # create_user requires a non-empty name; strip it at DB level to simulate legacy data
        nameless_user = User.objects.create_user(
            name="Placeholder", email="nameless@reviews.test", password="x",
        )
        User.objects.filter(pk=nameless_user.pk).update(name=None, first_name=None)
        nameless_user.refresh_from_db()
        result = _get_safe_display_name(nameless_user)
        self.assertEqual(result, "Verified Customer")


# ── 5. Admin can moderate reviews ──────────────────────────────────────────

class AdminReviewModerationTest(_ReviewFixtures):
    """
    Verifies the admin moderation workflow.

    Admin API uses Django's built-in admin, not a custom API endpoint.
    We test moderation by simulating admin actions directly on model instances
    and verifying that public endpoints respond correctly to is_approved /
    is_featured state changes.
    """

    def setUp(self):
        super().setUp()
        from api.models import ProductReview
        # Fresh per-test review so mutations don't bleed between tests
        self.review = ProductReview.objects.create(
            user=self.user_with_order, product=None,
            rating=5, comment="Awaiting moderation",
            is_approved=False, is_featured=False,
        )

    def test_unapproved_review_hidden_from_shop_endpoint(self):
        r = self.client.get(_SHOP_URL)
        ids = {item["id"] for item in r.data}
        self.assertNotIn(self.review.pk, ids)

    def test_admin_approves_review_and_it_becomes_visible(self):
        self.review.is_approved = True
        self.review.save()
        r = self.client.get(_SHOP_URL)
        ids = {item["id"] for item in r.data}
        self.assertIn(self.review.pk, ids)

    def test_admin_rejects_previously_visible_review(self):
        self.review.is_approved = True
        self.review.save()
        # Visible
        self.assertIn(self.review.pk, {item["id"] for item in self.client.get(_SHOP_URL).data})
        # Admin rejects
        self.review.is_approved = False
        self.review.save()
        # Hidden again
        self.assertNotIn(self.review.pk, {item["id"] for item in self.client.get(_SHOP_URL).data})

    def test_admin_features_approved_review_appears_in_highlights(self):
        self.review.is_approved = True
        self.review.is_featured = True
        self.review.save()
        r = self.client.get(_HIGHLIGHTS_URL)
        featured_ids = {item["id"] for item in r.data if item["is_featured"]}
        self.assertIn(self.review.pk, featured_ids)

    def test_review_model_registered_in_django_admin(self):
        """ProductReview (Review alias) must be registered in Django admin."""
        from django.contrib import admin as dj_admin
        from api.models import ProductReview
        self.assertIn(ProductReview, dj_admin.site._registry)

    def test_admin_list_editable_includes_moderation_fields(self):
        """list_editable should include is_approved and is_featured for bulk moderation."""
        from django.contrib import admin as dj_admin
        from api.models import ProductReview
        review_admin = dj_admin.site._registry[ProductReview]
        self.assertIn("is_approved", review_admin.list_editable)
        self.assertIn("is_featured", review_admin.list_editable)

    def test_admin_actions_registered(self):
        """All four moderation actions must be registered on ReviewAdmin."""
        from django.contrib import admin as dj_admin
        from api.models import ProductReview
        review_admin = dj_admin.site._registry[ProductReview]
        action_names = list(review_admin.actions)
        for expected in ("mark_approved", "mark_not_approved", "mark_featured", "remove_featured"):
            self.assertIn(expected, action_names, f"Action '{expected}' not registered")

    def test_review_type_column_returns_correct_values(self):
        """review_type() must return 'Product' or 'Shop' based on product FK."""
        from api.models import Order, ProductReview
        from django.contrib import admin as dj_admin
        review_admin = dj_admin.site._registry[ProductReview]

        # Use a fresh user to avoid the unique_shop_review_per_user constraint
        # (setUp already creates a shop review for user_with_order)
        type_test_user = User.objects.create_user(
            name="TypeTest", email="typetest@reviews.test", password="x"
        )
        Order.objects.create(customer=type_test_user)

        shop_review = ProductReview.objects.create(
            user=type_test_user, product=None, rating=4, comment="Shop"
        )
        product_review = ProductReview.objects.create(
            user=type_test_user, product=self.product, rating=4, comment="Prod"
        )
        self.assertEqual(review_admin.review_type(shop_review), "Shop")
        self.assertEqual(review_admin.review_type(product_review), "Product")

    def test_normal_user_cannot_access_admin_panel(self):
        """Non-staff users are redirected away from the admin."""
        self.client.force_authenticate(user=self.user_no_order)
        r = self.client.get("/admin/api/productreview/")
        # DRF APIClient doesn't follow redirects; Django admin returns 302 to login
        self.assertIn(r.status_code, [302, 403])


# ── 6. Custom admin REST API ────────────────────────────────────────────────

class AdminRestAPITest(_ReviewFixtures):
    """Tests for the custom staff-only /api/admin/reviews/ REST endpoints."""

    _ADMIN_URL = "/api/admin/reviews/"

    def setUp(self):
        super().setUp()
        from api.models import ProductReview
        self.review = ProductReview.objects.create(
            user=self.user_with_order, product=None,
            rating=4, comment="Admin API test review",
            is_approved=False, is_featured=False,
        )

    # ── Access control ───────────────────────────────────────────────────────

    def test_anonymous_cannot_access_admin_list(self):
        r = self.client.get(self._ADMIN_URL)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_cannot_access_admin_list(self):
        self.client.force_authenticate(user=self.user_no_order)
        r = self.client.get(self._ADMIN_URL)
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_list_all_reviews_including_unapproved(self):
        """Staff list returns unapproved reviews — unlike public endpoints."""
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(self._ADMIN_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn("results", r.data)
        ids = {item["id"] for item in r.data["results"]}
        # The unapproved review created in setUp must appear in the admin list
        self.assertIn(self.review.pk, ids)

    # ── Filters ──────────────────────────────────────────────────────────────

    def test_filter_by_type_shop(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(self._ADMIN_URL + "?type=shop")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        for item in r.data["results"]:
            self.assertEqual(item["review_type"], "shop")

    def test_filter_by_is_approved_false(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(self._ADMIN_URL + "?is_approved=false")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        for item in r.data["results"]:
            self.assertFalse(item["is_approved"])

    def test_search_by_comment_text(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(self._ADMIN_URL + "?search=Admin+API+test")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in r.data["results"]}
        self.assertIn(self.review.pk, ids)

    def test_pagination_limit_and_count(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(self._ADMIN_URL + "?limit=1&offset=0")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertGreater(r.data["count"], 0)
        self.assertLessEqual(len(r.data["results"]), 1)

    # ── Create ───────────────────────────────────────────────────────────────

    def test_staff_can_create_manual_review(self):
        # Use a fresh user who has no existing shop review to avoid unique constraint
        from api.models import Order
        fresh_user = User.objects.create_user(
            name="Staff Created", email="staffcreated@reviews.test", password="x"
        )
        Order.objects.create(customer=fresh_user)
        self.client.force_authenticate(user=self.staff_user)
        payload = {
            "user": fresh_user.pk,
            "rating": 5,
            "comment": "Manually added by staff",
            "title": "Staff pick",
            "is_approved": True,
        }
        r = self.client.post(self._ADMIN_URL, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.data["rating"], 5)
        self.assertTrue(r.data["is_approved"])

    def test_staff_duplicate_shop_review_returns_400(self):
        """Creating a second shop review for the same user via admin API returns 400."""
        self.client.force_authenticate(user=self.staff_user)
        # self.review (setUp) is already a shop review for user_with_order
        r = self.client.post(
            self._ADMIN_URL,
            {"user": self.user_with_order.pk, "rating": 4, "comment": "Duplicate"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", r.data)

    def test_create_without_user_returns_400(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.post(
            self._ADMIN_URL,
            {"rating": 5, "comment": "No user"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user", r.data["error"].lower())

    def test_create_with_nonexistent_user_returns_400(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.post(
            self._ADMIN_URL,
            {"user": 99999, "rating": 5, "comment": "Ghost user"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Detail / Patch / Delete ───────────────────────────────────────────────

    def test_staff_can_retrieve_review_detail(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(f"{self._ADMIN_URL}{self.review.pk}/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["id"], self.review.pk)

    def test_staff_can_approve_review_via_patch(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.patch(
            f"{self._ADMIN_URL}{self.review.pk}/",
            {"is_approved": True},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["is_approved"])
        self.review.refresh_from_db()
        self.assertTrue(self.review.is_approved)

    def test_staff_can_feature_review_via_patch(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.patch(
            f"{self._ADMIN_URL}{self.review.pk}/",
            {"is_featured": True},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["is_featured"])

    def test_patch_cannot_change_user_or_product(self):
        """user and product are not in EDITABLE fields — should be silently ignored."""
        self.client.force_authenticate(user=self.staff_user)
        original_user_pk = self.review.user_id
        r = self.client.patch(
            f"{self._ADMIN_URL}{self.review.pk}/",
            {"user": self.staff_user.pk, "comment": "Updated comment"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertEqual(self.review.user_id, original_user_pk)  # unchanged
        self.assertEqual(self.review.comment, "Updated comment")  # updated

    def test_staff_can_delete_review(self):
        from api.models import ProductReview
        self.client.force_authenticate(user=self.staff_user)
        to_delete = ProductReview.objects.create(
            user=self.user_no_order, product=None,
            rating=3, comment="To be deleted",
        )
        r = self.client.delete(f"{self._ADMIN_URL}{to_delete.pk}/")
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProductReview.objects.filter(pk=to_delete.pk).exists())

    def test_detail_404_for_nonexistent_review(self):
        self.client.force_authenticate(user=self.staff_user)
        r = self.client.get(f"{self._ADMIN_URL}99999/")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)


# ── 7. shop/me/ status endpoint ────────────────────────────────────────────

class ShopReviewMeTest(_ReviewFixtures):
    """Tests for GET /api/reviews/shop/me/"""

    def test_anonymous_gets_401(self):
        r = self.client.get(_SHOP_ME_URL)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_without_order_cannot_review(self):
        self.client.force_authenticate(user=self.user_no_order)
        r = self.client.get(_SHOP_ME_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(r.data["can_review"])
        self.assertFalse(r.data["has_order"])
        self.assertFalse(r.data["has_existing_review"])
        self.assertIsNone(r.data["review"])

    def test_user_with_order_and_no_review_can_review(self):
        from api.models import Order
        fresh = User.objects.create_user(name="Fresh", email="fresh@reviews.test", password="x")
        Order.objects.create(customer=fresh)
        self.client.force_authenticate(user=fresh)
        r = self.client.get(_SHOP_ME_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["can_review"])
        self.assertTrue(r.data["has_order"])
        self.assertFalse(r.data["has_existing_review"])
        self.assertIsNone(r.data["review"])

    def test_user_who_already_reviewed_cannot_review_again(self):
        from api.models import Order, ProductReview
        reviewed = User.objects.create_user(
            name="Reviewed", email="reviewed@reviews.test", password="x"
        )
        Order.objects.create(customer=reviewed)
        existing = ProductReview.objects.create(
            user=reviewed, product=None, rating=4,
            comment="My existing review", is_approved=True,
        )
        self.client.force_authenticate(user=reviewed)
        r = self.client.get(_SHOP_ME_URL)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(r.data["can_review"])
        self.assertTrue(r.data["has_order"])
        self.assertTrue(r.data["has_existing_review"])
        self.assertIsNotNone(r.data["review"])
        self.assertEqual(r.data["review"]["id"], existing.pk)
        self.assertEqual(r.data["review"]["rating"], 4)
        self.assertEqual(r.data["review"]["comment"], "My existing review")

    def test_response_shape_is_complete(self):
        """Response always contains all four keys regardless of state."""
        self.client.force_authenticate(user=self.user_no_order)
        r = self.client.get(_SHOP_ME_URL)
        for key in ("can_review", "has_order", "has_existing_review", "review"):
            self.assertIn(key, r.data, f"Missing key '{key}' in shop/me/ response")
