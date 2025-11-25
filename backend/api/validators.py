"""
Validators for product images and related functionality.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework import serializers


def validate_image_url(value):
    """
    Validate that an image URL is from the correct R2 domain.
    """
    if not value:
        return value
    
    # Check if URL starts with the R2 public URL
    if not value.startswith(settings.R2_PUBLIC_URL):
        raise ValidationError(
            f"Image URL must be from the configured R2 storage: {settings.R2_PUBLIC_URL}"
        )
    
    return value


def validate_product_images(product):
    """
    Validate that a product's images meet all requirements.
    
    Rules:
    1. All images have unique sort orders
    2. Sort orders should be sequential (recommended but not enforced)
    """
    images = product.images.all()
    
    if not images.exists():
        return
    
    # Check for unique sort orders
    sort_orders = list(images.values_list("sort_order", flat=True))
    if len(sort_orders) != len(set(sort_orders)):
        raise ValidationError("All images must have unique sort orders")


class ProductImageValidationMixin:
    """
    Mixin for serializers that handle product images.
    Provides validation for image-related data.
    """
    
    def validate_images(self, images_data):
        """
        Validate the images array in a product create/update request.
        
        Rules:
        1. Sort orders should be unique
        2. All image URLs should be valid
        3. First image (by sort_order) is automatically primary
        """
        if not images_data:
            return images_data
        
        # Check for duplicate sort orders
        sort_orders = [img.get("sort_order", idx) for idx, img in enumerate(images_data)]
        if len(sort_orders) != len(set(sort_orders)):
            raise serializers.ValidationError(
                "Images must have unique sort orders"
            )
        
        # Validate each image URL
        for img in images_data:
            url = img.get("image_url")
            if url:
                validate_image_url(url)
        
        return images_data


def validate_image_file_extension(filename):
    """
    Validate that a filename has an allowed image extension.
    """
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp"]
    
    if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
        raise ValidationError(
            f"File must have one of the following extensions: {', '.join(allowed_extensions)}"
        )
    
    return filename

