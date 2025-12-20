"""
Custom forms for product image management in admin.
"""

from django import forms
from django.conf import settings
from django.core.exceptions import ValidationError
from django.forms.models import BaseInlineFormSet

from .models import Order, OrderItem, ProductImage
from .r2_storage import (
    generate_unique_object_key,
    get_r2_client,
    upload_compressed_image_to_r2,
    validate_image_size,
    validate_image_type,
)


class ProductImageAdminForm(forms.ModelForm):
    """
    Custom form for ProductImage admin that allows file upload directly.
    If image_file is provided, it uploads to R2 and saves the URL.
    """

    image_file = forms.ImageField(
        required=False,
        label="Upload Image",
        help_text=f"Upload an image file (max {settings.MAX_IMAGE_SIZE / (1024*1024):.0f}MB). Supported formats: JPEG, PNG, WebP",
    )

    class Meta:
        model = ProductImage
        fields = "__all__"
        widgets = {
            "image_url": forms.URLInput(
                attrs={
                    "placeholder": "Or paste image URL here",
                    "style": "width: 100%;",
                }
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Make image_url not required since we can upload a file instead
        self.fields["image_url"].required = False

        # Add custom styling to image_file field
        self.fields["image_file"].widget.attrs.update(
            {
                "accept": "image/jpeg,image/png,image/webp",
                "style": "margin-bottom: 10px;",
            }
        )

    def clean(self):
        cleaned_data = super().clean()
        image_file = cleaned_data.get("image_file")
        image_url = cleaned_data.get("image_url")

        # Must have either a file or a URL
        if not image_file and not image_url:
            raise ValidationError(
                "Please either upload an image file or provide an image URL."
            )

        # If file is provided, validate it
        if image_file:
            # Validate file size
            if not validate_image_size(image_file.size):
                max_size_mb = settings.MAX_IMAGE_SIZE / (1024 * 1024)
                raise ValidationError(
                    f"Image file size exceeds maximum allowed size of {max_size_mb}MB"
                )

            # Validate file type
            content_type = image_file.content_type
            if not validate_image_type(content_type):
                raise ValidationError(
                    f"Invalid image type. Allowed types: {', '.join(settings.ALLOWED_IMAGE_TYPES)}"
                )

        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=False)
        image_file = self.cleaned_data.get("image_file")

        # If a file was uploaded, compress and upload it to R2
        if image_file:
            try:
                # Get product ID (required for compression upload)
                product_id = instance.product.id if instance.product else None
                if not product_id:
                    raise ValidationError(
                        "Product must be set before uploading images."
                    )

                # Reset file pointer and read content
                image_file.seek(0)
                file_content = image_file.read()

                # Compress and upload to R2
                upload_result = upload_compressed_image_to_r2(
                    file_content,
                    image_file.name,
                    product_id=product_id,
                    max_width=1920,
                    max_height=1920,
                    quality=85,
                )

                # Set the public URL from compressed upload
                instance.image_url = upload_result["public_url"]

            except Exception as e:
                import traceback

                error_details = traceback.format_exc()
                print(f"R2 Upload Error: {error_details}")
                raise ValidationError(f"Failed to upload image to R2: {str(e)}")

        if commit:
            instance.save()

        return instance


class ProductImageInlineForm(forms.ModelForm):
    """
    Custom inline form for product images.
    Simplified version for inline editing.
    """

    image_file = forms.ImageField(
        required=False, label="Upload", help_text="Upload image"
    )

    class Meta:
        model = ProductImage
        fields = ["image_url", "sort_order", "alt_text"]
        widgets = {
            "image_url": forms.URLInput(
                attrs={"placeholder": "Or paste URL", "style": "width: 100%;"}
            ),
        }
        help_texts = {
            "sort_order": "First image (0) is automatically primary",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["image_url"].required = False
        self.fields["image_file"].widget.attrs.update(
            {"accept": "image/jpeg,image/png,image/webp", "class": "image-upload-field"}
        )

    def clean(self):
        cleaned_data = super().clean()
        image_file = cleaned_data.get("image_file")
        image_url = cleaned_data.get("image_url")

        # Skip validation for DELETE checkbox
        if self.cleaned_data.get("DELETE"):
            return cleaned_data

        # Must have either a file or a URL (but not for new empty forms)
        if not image_file and not image_url and self.instance.pk is None:
            # This is a new empty inline form, skip validation
            return cleaned_data

        if not image_file and not image_url and self.instance.pk:
            # Existing instance must have a URL
            raise ValidationError(
                "Please either upload an image file or provide an image URL."
            )

        # If file is provided, validate it
        if image_file:
            if not validate_image_size(image_file.size):
                max_size_mb = settings.MAX_IMAGE_SIZE / (1024 * 1024)
                raise ValidationError(
                    f"Image file size exceeds maximum allowed size of {max_size_mb}MB"
                )

            content_type = image_file.content_type
            if not validate_image_type(content_type):
                raise ValidationError(
                    f"Invalid image type. Allowed types: {', '.join(settings.ALLOWED_IMAGE_TYPES)}"
                )

        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=False)
        image_file = self.cleaned_data.get("image_file")

        if image_file:
            try:
                # Get product ID (required for compression upload)
                product_id = instance.product.id if instance.product else None
                if not product_id:
                    raise ValidationError(
                        "Product must be set before uploading images."
                    )

                # Reset file pointer and read content
                image_file.seek(0)
                file_content = image_file.read()

                # Compress and upload to R2
                upload_result = upload_compressed_image_to_r2(
                    file_content,
                    image_file.name,
                    product_id=product_id,
                    max_width=1920,
                    max_height=1920,
                    quality=85,
                )

                # Set the public URL from compressed upload
                instance.image_url = upload_result["public_url"]

            except Exception as e:
                import traceback

                error_details = traceback.format_exc()
                print(f"R2 Upload Error: {error_details}")
                raise ValidationError(f"Failed to upload image to R2: {str(e)}")

        if commit:
            instance.save()

        return instance


class OrderItemInlineFormSet(BaseInlineFormSet):
    """
    Custom formset for OrderItem that validates for duplicate products.
    """

    def clean(self):
        """
        Validate that no duplicate products exist in the formset.
        """
        if any(self.errors):
            # Don't validate if there are already form errors
            return

        products_seen = {}
        existing_order_items = {}

        # Get the order instance
        if self.instance and self.instance.pk:
            order = self.instance
            # Get existing items in the database for this order
            # Exclude items that are being edited in this formset
            existing_items = OrderItem.objects.filter(order=order).exclude(
                pk__in=[form.instance.pk for form in self.forms if form.instance and form.instance.pk]
            )
            for item in existing_items:
                if item.product:
                    existing_order_items[item.product.id] = item

        for form in self.forms:
            # Skip forms that have errors
            if form.errors:
                continue
            
            # Skip if form doesn't have cleaned_data (not yet cleaned or empty)
            if not hasattr(form, 'cleaned_data') or not form.cleaned_data:
                continue

            # Skip deleted forms
            if form.cleaned_data.get("DELETE", False):
                continue

            product = form.cleaned_data.get("product")
            if not product:
                continue

            product_id = product.id

            # Check if product already exists in database (not in this formset)
            if product_id in existing_order_items:
                form.add_error(
                    "product",
                    ValidationError("This product already exists in this order.")
                )
                continue

            # Check for duplicates within the formset
            if product_id in products_seen:
                # This product was already seen in another form
                form.add_error(
                    "product",
                    ValidationError("This product already exists in this order.")
                )
            else:
                products_seen[product_id] = product
