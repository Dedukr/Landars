from django.contrib.auth import get_user_model
from django.test import TestCase

User = get_user_model()


class ShippingModelTest(TestCase):
    """Test cases for Shipping models"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            name="Test User", email="test@example.com", password="testpass123"
        )

    def test_shipping_details_model_exists(self):
        """Test that ShippingDetails model can be imported"""
        from shipping.models import ShippingDetails

        # Just verify the model exists and can be instantiated
        self.assertTrue(hasattr(ShippingDetails, "_meta"))
