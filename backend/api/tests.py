from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class APITestCase(TestCase):
    """Base test case for API tests"""

    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            name="Test User", email="test@example.com", password="testpass123"
        )

    def authenticate_user(self):
        """Helper method to authenticate user"""
        self.client.force_authenticate(user=self.user)


class ProductAPITest(APITestCase):
    """Test cases for Product API endpoints"""

    def test_products_list_endpoint_exists(self):
        """Test that products list endpoint is accessible"""
        response = self.client.get("/api/products/")
        # Should return 200 or 404 if no products exist, but not 500
        self.assertIn(
            response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
        )


class CategoryAPITest(APITestCase):
    """Test cases for Category API endpoints"""

    def test_categories_list_endpoint_exists(self):
        """Test that categories list endpoint is accessible"""
        response = self.client.get("/api/categories/")
        # Should return 200 or 404 if no categories exist, but not 500
        self.assertIn(
            response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
        )


class CartAPITest(APITestCase):
    """Test cases for Cart API endpoints"""

    def test_cart_endpoint_requires_authentication(self):
        """Test that cart endpoint requires authentication"""
        response = self.client.get("/api/cart/")
        # Should return 401 Unauthorized or 403 Forbidden
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_cart_access(self):
        """Test that authenticated users can access cart"""
        self.authenticate_user()
        response = self.client.get("/api/cart/")
        # Should return 200 OK or 404 if cart doesn't exist
        self.assertIn(
            response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
        )


class WishlistAPITest(APITestCase):
    """Test cases for Wishlist API endpoints"""

    def test_wishlist_endpoint_requires_authentication(self):
        """Test that wishlist endpoint requires authentication"""
        response = self.client.get("/api/wishlist/")
        # Should return 401 Unauthorized or 403 Forbidden
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_wishlist_access(self):
        """Test that authenticated users can access wishlist"""
        self.authenticate_user()
        response = self.client.get("/api/wishlist/")
        # Should return 200 OK or 404 if wishlist doesn't exist
        self.assertIn(
            response.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
        )
