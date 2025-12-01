"""
Custom forms for product image management in admin.
"""
from django import forms
from django.core.exceptions import ValidationError
from django.conf import settings

<<<<<<< HEAD
from .models import ProductImage
from .r2_storage import (
    generate_unique_object_key,
    get_r2_client,
    upload_compressed_image_to_r2,
    validate_image_size,
    validate_image_type,
)
=======
from .models import Order, OrderItem


class OrderItemForm(forms.ModelForm):
    """
    Custom form for OrderItem that skips unique_together validation.

    The unique_together constraint is handled in OrderAdmin.save_formset()
    which merges duplicate products by combining their quantities.
    """

    class Meta:
        model = OrderItem
        fields = "__all__"

    def validate_unique(self):
        """
        Skip unique_together validation - handled in save_formset.

        This prevents Django from raising a validation error when adding
        a product that already exists in the order. Instead, save_formset
        will merge the quantities automatically.
        """
        # Don't call super().validate_unique() to skip unique_together check
        # The form will still validate other fields normally
        pass

    def clean(self):
        """Perform standard form validation except for unique_together."""
        cleaned_data = super().clean()
        # All other validations (required fields, etc.) still happen
        return cleaned_data


class OrderItemFormSet(BaseInlineFormSet):
    """
    Custom formset that allows duplicate products.

    Duplicate products are handled in OrderAdmin.save_formset() which merges
    quantities automatically. This formset doesn't need custom logic since
    the form's validate_unique() method skips uniqueness validation.
    """

    pass


# class OrderAdminForm(forms.ModelForm):
#     # customer = forms.ModelChoiceField(
#     #     queryset=CustomUser.objects.filter(is_staff=False, is_active=True),
#     #     label="Customer",
#     # )
#     # notes = forms.CharField(
#     #     label="Notes",
#     #     required=False,
#     #     widget=forms.Textarea(attrs={"rows": 3}),
#     # )
#     # delivery_date = forms.DateField(
#     #     label="Order Date",
#     #     widget=forms.DateInput(attrs={"type": "date"}),
#     # )
#     # status = forms.ChoiceField(
#     #     label="Status",
#     #     choices=Order.status.field.choices,
#     #     initial=Order.status.field.choices[0][1],
#     #     widget=forms.Select(attrs={"class": "form-control"}),
#     # )
#     # inline = [OrderItemInline]

#     class Meta:
#         model = Order
#         # fields = "__all__"
#         fields = [
#             "customer",
#         ]
#         widgets = {
#             "delivery_date": forms.DateInput(format="%d %B %Y", attrs={"type": "date"}),
#         }

#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)

#         # # Filter only non-staff users
#         # if "customer" in self.fields:
#         #     self.fields["customer"].queryset = CustomUser.objects.filter(
#         #         is_staff=False, is_active=True
#         #     )

#         #     # Customize label to show name
#         #     self.fields["customer"].label_from_instance = lambda obj: obj.name
>>>>>>> main


class ProductImageAdminForm(forms.ModelForm):
    """
    Custom form for ProductImage admin that allows file upload directly.
    If image_file is provided, it uploads to R2 and saves the URL.
    """
    image_file = forms.ImageField(
        required=False,
        label="Upload Image",
        help_text=f"Upload an image file (max {settings.MAX_IMAGE_SIZE / (1024*1024):.0f}MB). Supported formats: JPEG, PNG, WebP"
    )

    class Meta:
        model = ProductImage
        fields = '__all__'
        widgets = {
            'image_url': forms.URLInput(attrs={
                'placeholder': 'Or paste image URL here',
                'style': 'width: 100%;'
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Make image_url not required since we can upload a file instead
        self.fields['image_url'].required = False
        
        # Add custom styling to image_file field
        self.fields['image_file'].widget.attrs.update({
            'accept': 'image/jpeg,image/png,image/webp',
            'style': 'margin-bottom: 10px;'
        })

    def clean(self):
        cleaned_data = super().clean()
        image_file = cleaned_data.get('image_file')
        image_url = cleaned_data.get('image_url')

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
        image_file = self.cleaned_data.get('image_file')

        # If a file was uploaded, compress and upload it to R2
        if image_file:
            try:
                # Get product ID (required for compression upload)
                product_id = instance.product.id if instance.product else None
                if not product_id:
                    raise ValidationError("Product must be set before uploading images.")

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
                instance.image_url = upload_result['public_url']

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
        required=False,
        label="Upload",
        help_text="Upload image"
    )

    class Meta:
        model = ProductImage
        fields = ['image_url', 'sort_order', 'alt_text']
        widgets = {
            'image_url': forms.URLInput(attrs={
                'placeholder': 'Or paste URL',
                'style': 'width: 100%;'
            }),
        }
        help_texts = {
            'sort_order': 'First image (0) is automatically primary',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['image_url'].required = False
        self.fields['image_file'].widget.attrs.update({
            'accept': 'image/jpeg,image/png,image/webp',
            'class': 'image-upload-field'
        })

    def clean(self):
        cleaned_data = super().clean()
        image_file = cleaned_data.get('image_file')
        image_url = cleaned_data.get('image_url')

        # Skip validation for DELETE checkbox
        if self.cleaned_data.get('DELETE'):
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
        image_file = self.cleaned_data.get('image_file')

        if image_file:
            try:
                # Get product ID (required for compression upload)
                product_id = instance.product.id if instance.product else None
                if not product_id:
                    raise ValidationError("Product must be set before uploading images.")

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
                instance.image_url = upload_result['public_url']

            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"R2 Upload Error: {error_details}")
                raise ValidationError(f"Failed to upload image to R2: {str(e)}")

        if commit:
            instance.save()

        return instance
