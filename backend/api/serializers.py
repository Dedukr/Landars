from decimal import Decimal

from account.serializers import AddressSerializer
from django.db import transaction
from django.db.models import Q
from django.utils.text import slugify
from rest_framework import serializers
from shipping.models import Shipment

from .models import (
    Cart,
    CartItem,
    CategoryGroup,
    Order,
    OrderItem,
    Product,
    ProductCategory,
    ProductImage,
    ProductReview,
    Wishlist,
    WishlistItem,
)
from .validators import ProductImageValidationMixin
from api.services.product_sales import SOLD_ORDER_STATUSES


class CategoryGroupSerializer(serializers.ModelSerializer):
    category_ids = serializers.SerializerMethodField()
    category_names = serializers.SerializerMethodField()
    products_count = serializers.SerializerMethodField()

    class Meta:
        model = CategoryGroup
        fields = [
            "id",
            "name",
            "description",
            "image_url",
            "category_ids",
            "category_names",
            "products_count",
        ]

    def get_category_ids(self, obj):
        return list(obj.categories.values_list("id", flat=True).order_by("id"))

    def get_category_names(self, obj):
        return list(obj.categories.values_list("name", flat=True).order_by("name"))

    def get_products_count(self, obj):
        counts = self.context.get("products_count", {})
        if counts:
            return counts.get(obj.id, 0)
        return sum(c.get_product_count() for c in obj.categories.all())


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    top_seller_sold_quantity = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategory
        fields = [
            "id",
            "name",
            "description",
            "sold_quantity",
            "products_count",
            "image_url",
            "top_seller_sold_quantity",
        ]

    def get_products_count(self, obj):
        return self.context.get("products_count", {}).get(obj.id, 0)

    def get_image_url(self, obj):
        # Prefer the category's own image; fall back to top-seller product image.
        if obj.image_url:
            return obj.image_url
        return self.context.get("top_seller_image", {}).get(obj.id)

    def get_top_seller_sold_quantity(self, obj):
        return self.context.get("top_seller_sold_quantity", {}).get(obj.id, 0)


class ProductImageSerializer(serializers.ModelSerializer):
    is_primary = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = [
            "id",
            "image_url",
            "sort_order",
            "is_primary",
            "alt_text",
        ]
        read_only_fields = ["id", "is_primary"]

    def get_is_primary(self, obj):
        """The first image (by sort_order) is always primary."""
        return obj.is_primary

    def validate(self, data):
        """Validate image data."""
        # Ensure sort_order is non-negative
        if "sort_order" in data and data["sort_order"] < 0:
            raise serializers.ValidationError(
                {"sort_order": "Sort order must be non-negative"}
            )
        return data


# ── Shared helpers ────────────────────────────────────────────────────────────

def _get_safe_display_name(user) -> str:
    """
    Build a privacy-safe public display name from a CustomUser instance.

    Priority:
      1. ``first_name`` — shown exactly as stored (e.g. "Yuliia", "Ruslan").
      2. First word of ``name`` (legacy combined field) — avoids exposing surname.
      3. Fallback: "Verified Customer".

    Intentionally never falls back to email or username so that no PII leaks
    through public review endpoints.
    """
    if not user:
        return "Verified Customer"

    first = getattr(user, "first_name", None)
    if first and first.strip():
        return first.strip()

    legacy = getattr(user, "name", None)
    if legacy and legacy.strip():
        return legacy.strip().split()[0]

    return "Verified Customer"


def _get_verified_purchase(user, product) -> bool:
    """Return True if ``user`` has a paid order containing ``product``."""
    if not user or not product:
        return False
    return OrderItem.objects.filter(
        order__customer=user,
        order__status__in=SOLD_ORDER_STATUSES,
    ).filter(
        Q(product=product) | Q(item_name=product.name)
    ).exists()


# ── Public display serializer ──────────────────────────────────────────────

class ReviewPublicSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for displaying reviews on public pages.

    Privacy rules:
    - ``user_name`` uses first name only (or "Verified Customer") — never email.
    - The raw ``user`` PK (integer) is excluded.
    - No ``is_approved`` / ``updated_at`` / internal flags exposed.

    Used by: GET /api/reviews/highlights/, GET /api/reviews/shop/,
             GET /api/products/{id}/reviews/
    """

    user_name = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_slug = serializers.SerializerMethodField()
    review_type = serializers.SerializerMethodField()
    is_verified_purchase = serializers.SerializerMethodField()

    def get_user_name(self, obj):
        return _get_safe_display_name(getattr(obj, "user", None))

    def _accessible_product(self, obj):
        """
        Return the related Product if it exists AND is still publicly accessible
        (``active=True``).  Returns ``None`` for shop reviews or deactivated products,
        so callers never expose a broken product link to the public.
        """
        if not obj.product_id:
            return None
        product = obj.product  # may be None if FK resolution fails (edge case)
        if product is None:
            return None
        # Suppress the link/name when the product is no longer active, but still
        # show the review with ``review_type="product"`` so the badge is correct.
        if not getattr(product, "active", True):
            return None
        return product

    def get_product_name(self, obj):
        product = self._accessible_product(obj)
        return product.name if product else None

    def get_product_slug(self, obj):
        product = self._accessible_product(obj)
        return slugify(product.name) if product else None

    def get_review_type(self, obj):
        # Use product_id (not the live FK) so the badge is correct even when the
        # product is deactivated or the FK resolution returns None.
        return "product" if obj.product_id else "shop"

    def get_is_verified_purchase(self, obj):
        return _get_verified_purchase(getattr(obj, "user", None), getattr(obj, "product", None))

    class Meta:
        model = ProductReview
        fields = [
            "id",
            "rating", "title", "comment",
            "review_type",
            "product", "product_name", "product_slug",
            "user_name",
            "created_at",
            "is_featured",
            "is_verified_purchase",
        ]
        read_only_fields = [
            "id",
            "rating", "title", "comment",
            "review_type",
            "product", "product_name", "product_slug",
            "user_name",
            "created_at",
            "is_featured",
            "is_verified_purchase",
        ]


# ── Write serializer for shop reviews ─────────────────────────────────────

class ShopReviewCreateSerializer(serializers.ModelSerializer):
    """
    Write-only serializer for creating a general shop review.

    Accepted fields (client-supplied):
    - ``rating``  required  — integer 1–5
    - ``title``   optional  — up to 120 characters
    - ``comment`` required  — must not be blank

    The view always calls ``serializer.save(product=None, user=request.user)``
    so neither ``product`` nor ``user`` can be injected by the client.

    After a successful save the view responds with ``ReviewPublicSerializer``
    so the client receives the full public representation.
    """

    def validate_rating(self, value):
        if value is None:
            raise serializers.ValidationError("Please select a rating.")
        return value

    def validate_comment(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Please write a short review.")
        return value.strip()

    def validate_title(self, value):
        return value.strip() if value else value

    class Meta:
        model = ProductReview
        fields = ["rating", "title", "comment"]


# ── Admin serializer (for future API-based admin views) ────────────────────

class ReviewAdminSerializer(serializers.ModelSerializer):
    """
    Full-access serializer for staff/admin API views.

    Exposes fields that must NEVER appear in public endpoints:
    - ``user`` PK and ``user_email`` for identifying the reviewer
    - ``is_approved`` and ``is_featured`` as writable for moderation
    - ``updated_at`` for audit trail

    Not currently wired to any URL — ready for use when an API-based
    admin panel is built under api/admin_api/.
    """

    user_display = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_slug = serializers.SerializerMethodField()
    review_type = serializers.SerializerMethodField()

    def get_user_display(self, obj):
        user = getattr(obj, "user", None)
        if not user:
            return "Unknown"
        display = getattr(user, "get_display_name", None)
        if callable(display):
            result = display()
            if result:
                return result
        return getattr(user, "email", None) or "Unknown"

    def get_user_email(self, obj):
        user = getattr(obj, "user", None)
        return getattr(user, "email", None) if user else None

    def get_product_name(self, obj):
        return obj.product.name if (obj.product_id and obj.product) else None

    def get_product_slug(self, obj):
        return slugify(obj.product.name) if (obj.product_id and obj.product) else None

    def get_review_type(self, obj):
        return "product" if obj.product_id else "shop"

    class Meta:
        model = ProductReview
        fields = [
            "id",
            "user", "user_display", "user_email",
            "product", "product_name", "product_slug", "review_type",
            "rating", "title", "comment",
            "is_approved", "is_featured",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id",
            "user", "user_display", "user_email",
            "product", "product_name", "product_slug", "review_type",
            "created_at", "updated_at",
        ]
        # is_approved and is_featured are writable for moderation


# ── Internal / legacy serializer ──────────────────────────────────────────

class ReviewSerializer(serializers.ModelSerializer):
    """
    Internal serializer kept for backward compatibility.

    Used by: ProductReviewListCreate (product review creation + display).

    Note: ``user_name`` in this serializer may fall back to email — do NOT
    use this on public endpoints.  Use ``ReviewPublicSerializer`` instead.
    """

    user_name = serializers.SerializerMethodField()
    is_verified_purchase = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_slug = serializers.SerializerMethodField()
    review_type = serializers.SerializerMethodField()

    def get_user_name(self, obj):
        # Internal use: safe fallback chain (email visible to authenticated user who left the review)
        return _get_safe_display_name(getattr(obj, "user", None))

    def get_is_verified_purchase(self, obj):
        return _get_verified_purchase(getattr(obj, "user", None), getattr(obj, "product", None))

    def get_product_name(self, obj):
        return obj.product.name if (obj.product_id and obj.product) else None

    def get_product_slug(self, obj):
        return slugify(obj.product.name) if (obj.product_id and obj.product) else None

    def get_review_type(self, obj):
        return "product" if obj.product_id else "shop"

    class Meta:
        model = ProductReview
        fields = [
            "id", "user", "user_name",
            "product", "product_name", "product_slug", "review_type",
            "rating", "title", "comment",
            "is_approved", "is_featured",
            "created_at", "is_verified_purchase",
        ]
        read_only_fields = [
            "id", "user", "user_name",
            "product", "product_name", "product_slug", "review_type",
            "is_approved", "is_featured",
            "created_at", "is_verified_purchase",
        ]


# Alias — keeps any remaining imports of ``ProductReviewSerializer`` working
ProductReviewSerializer = ReviewSerializer


class ProductSerializer(ProductImageValidationMixin, serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, required=False)
    primary_image = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    categories = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "base_price",
            "holiday_fee",
            "price",
            "categories",
            "images",
            "primary_image",
            "sold_quantity",
            "sold_orders_count",
        ]
        read_only_fields = ["id", "primary_image", "sold_quantity", "sold_orders_count"]

    def get_categories(self, obj):
        """Return the product's own (leaf) category names."""
        return [cat.name for cat in obj.categories.all().order_by("name")]

    # def get_stock_quantity(self, obj):
    #     stock = Stock.objects.filter(product=obj).first()
    #     return stock.quantity if stock else 0

    def get_primary_image(self, obj):
        """Get the primary image URL for list views."""
        return obj.get_primary_image()

    def validate_price(self, value):
        """Ensure price is positive."""
        if value < 0:
            raise serializers.ValidationError("Price must be non-negative")
        return value

    @transaction.atomic
    def create(self, validated_data):
        """Create product with images."""
        images_data = validated_data.pop("images", [])
        product = Product.objects.create(**validated_data)

        # Create images with proper ordering
        for idx, image_data in enumerate(images_data):
            # If sort_order not provided, use index
            if "sort_order" not in image_data:
                image_data["sort_order"] = idx
            ProductImage.objects.create(product=product, **image_data)

        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        """Update product and replace images. Old images are deleted from R2 automatically."""
        images_data = validated_data.pop("images", None)

        # Update basic product fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Replace images if provided
        if images_data is not None:
            # Delete existing images (will also delete from R2 via model's delete method)
            instance.images.all().delete()

            # Create new images
            for idx, image_data in enumerate(images_data):
                # If sort_order not provided, use index
                if "sort_order" not in image_data:
                    image_data["sort_order"] = idx
                ProductImage.objects.create(product=instance, **image_data)

        return instance


class ProductListSerializer(serializers.ModelSerializer):
    """Serializer for product list view - returns primary image and all images for carousel."""

    primary_image = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    categories = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "categories",
            "primary_image",
            "images",
            "sold_quantity",
            "sold_orders_count",
        ]

    def get_primary_image(self, obj):
        """Get only the primary image URL."""
        return obj.get_primary_image()

    def get_images(self, obj):
        """Get all image URLs for carousel."""
        return [
            img.image_url for img in obj.images.all()[:5]
        ]  # Limit to 5 images for performance

    def get_categories(self, obj):
        """Return the product's own (leaf) category names."""
        return [cat.name for cat in obj.categories.all().order_by("name")]


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_price = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_price",
            "quantity",
            "total_price",
        ]
        read_only_fields = ["id", "product_name", "product_price", "total_price"]

    def get_product_name(self, obj):
        """Return stored item name if product is deleted, otherwise current product name."""
        if obj.item_name:
            return obj.item_name
        return obj.product.name if obj.product else "Deleted product"

    def get_product_price(self, obj):
        """Return price at order time (item_price) when set, else current product price."""
        if obj.item_price is not None:
            return obj.item_price
        return obj.product.price if obj.product else Decimal("0.00")

    def get_total_price(self, obj):
        """Use the model's get_total_price method which handles deleted products."""
        total = obj.get_total_price()
        return total if total != "" else Decimal("0.00")

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        return value

    def validate(self, data):
        # Do not perform blocking validations at serializer-level
        return data


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, required=True)
    customer_name = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()
    total_weight = serializers.SerializerMethodField()
    shipping_method_id = serializers.IntegerField(
        source="shipping_details.shipping_method_id",
        allow_null=True,
        required=False,
    )
    shipping_tracking_number = serializers.CharField(
        source="shipping_details.shipping_tracking_number",
        allow_blank=True,
        allow_null=True,
        required=False,
        read_only=True,
    )
    shipping_tracking_url = serializers.URLField(
        source="shipping_details.shipping_tracking_url",
        allow_null=True,
        required=False,
        read_only=True,
    )
    shipping_label_url = serializers.URLField(
        source="shipping_details.provider_label_url",
        allow_null=True,
        required=False,
        read_only=True,
    )
    # Match :class:`shipping.models.Shipment.sendcloud_parcel_id` (BigIntegerField).
    sendcloud_parcel_id = serializers.IntegerField(
        source="shipping_details.sendcloud_parcel_id",
        allow_null=True,
        required=False,
        read_only=True,
        max_value=9223372036854775807,
        min_value=-9223372036854775808,
    )
    shipment_status = serializers.CharField(
        source="shipping_details.status",
        read_only=True,
    )

    class Meta:
        model = Order
        fields = [
            "id",
            "delivery_date_order_id",
            "customer",
            "customer_name",
            "notes",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee_manual",
            "delivery_fee",
            "discount",
            "status",
            "created_at",
            "total_price",
            "total_items",
            "total_weight",
            "items",
            # Shipping fields
            "shipping_method_id",
            "shipping_tracking_number",
            "shipping_tracking_url",
            "shipping_label_url",
            "sendcloud_parcel_id",
            "shipment_status",
        ]
        read_only_fields = [
            "id",
            "delivery_date_order_id",
            "customer_name",
            "created_at",
            "total_price",
            "total_items",
            # Shipping tracking fields are read-only (set by backend)
            "shipping_tracking_number",
            "shipping_tracking_url",
            "shipping_label_url",
            "sendcloud_parcel_id",
            "shipment_status",
        ]

    def validate(self, data):
        """Basic validation only; duplicate-prevention removed."""
        return data

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.get_display_name()
        return None

    def get_total_price(self, obj):
        return obj.total_price

    def get_total_items(self, obj):
        return obj.total_items

    def get_total_weight(self, obj):
        return str(obj.total_weight)

    def validate_delivery_date(self, value):
        # Allow past dates; business logic can handle downstream
        return value

    def validate_items(self, value):
        # Allow empty items list at serializer-level
        return value

    @transaction.atomic
    def create(self, validated_data):
        shipping_data = validated_data.pop("shipping_details", {})
        items_data = validated_data.pop("items")
        # Create order instance but delay finalizing delivery fields until items are known
        order = Order.objects.create(**validated_data)

        if shipping_data:
            Shipment.objects.create(
                order=order,
                status=Shipment.Status.DRAFT,
                **shipping_data,
            )
        else:
            Shipment.objects.get_or_create(
                order=order,
                defaults={"status": Shipment.Status.DRAFT},
            )

        # Persist items
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)

        # Compute delivery fields from provided items and save once if needed
        if not order.delivery_fee_manual:
            is_home_delivery, delivery_fee = (
                order.calculate_delivery_fee_and_home_status_from_items(items_data)
            )
            if (
                order.is_home_delivery != is_home_delivery
                or order.delivery_fee != delivery_fee
            ):
                order.is_home_delivery = is_home_delivery
                order.delivery_fee = delivery_fee
                order.save(update_fields=["is_home_delivery", "delivery_fee"])

        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        shipping_data = validated_data.pop("shipping_details", None)

        # Update basic fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        # If items provided, replace them
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                OrderItem.objects.create(order=instance, **item_data)

        # Compute delivery fields from current or provided items, then save once
        if not instance.delivery_fee_manual:
            if items_data is not None:
                compute_source = items_data
            else:
                compute_source = []
                for i in instance.items.select_related("product").prefetch_related(
                    "product__categories"
                ):
                    row = {"product": i.product, "quantity": i.quantity}
                    tp = i.get_total_price()
                    if tp != "":
                        row["line_total"] = tp
                    compute_source.append(row)

            is_home_delivery, delivery_fee = (
                instance.calculate_delivery_fee_and_home_status_from_items(
                    compute_source
                )
            )
            if (
                instance.is_home_delivery != is_home_delivery
                or instance.delivery_fee != delivery_fee
            ):
                instance.is_home_delivery = is_home_delivery
                instance.delivery_fee = delivery_fee

        instance.save()

        Shipment.objects.get_or_create(
            order=instance,
            defaults={"status": Shipment.Status.DRAFT},
        )

        if shipping_data is not None:
            details = getattr(instance, "shipping_details", None)
            if details:
                for key, value in shipping_data.items():
                    setattr(details, key, value)
                details.save()
            else:
                Shipment.objects.create(
                    order=instance,
                    status=Shipment.Status.DRAFT,
                    **shipping_data,
                )
        return instance


class WishlistItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_price = serializers.DecimalField(
        source="product.price",
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0"),
        read_only=True,
    )
    product_description = serializers.CharField(
        source="product.description", read_only=True
    )
    product_categories = serializers.SerializerMethodField()

    class Meta:
        model = WishlistItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_price",
            "product_description",
            "product_categories",
            "added_date",
        ]
        read_only_fields = ["id", "added_date"]

    def get_product_categories(self, obj):
        """Return the product's own (leaf) category names."""
        return [cat.name for cat in obj.product.categories.all().order_by("name")]


class WishlistSerializer(serializers.ModelSerializer):
    items = WishlistItemSerializer(many=True, read_only=True)
    total_items = serializers.SerializerMethodField()

    class Meta:
        model = Wishlist
        fields = [
            "id",
            "items",
            "total_items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_total_items(self, obj):
        return obj.total_items


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_price = serializers.DecimalField(
        source="product.price",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    product_image_url = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_price",
            "product_image_url",
            "quantity",
            "total_price",
            "added_date",
        ]
        read_only_fields = ["id", "added_date", "total_price"]

    def get_product_image_url(self, obj):
        # Return the image URL if exists
        if hasattr(obj.product, "image") and obj.product.image:
            return obj.product.image.url
        return None

    def get_total_price(self, obj):
        return str(obj.get_total_price())


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()
    sum_price = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()
    total_weight = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            "id",
            "items",
            "notes",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee",
            "discount",
            "sum_price",
            "total_price",
            "total_items",
            "total_weight",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_total_price(self, obj):
        return str(obj.total_price)

    def get_sum_price(self, obj):
        return str(obj.sum_price)

    def get_total_items(self, obj):
        return float(obj.total_items)

    def get_total_weight(self, obj):
        return str(obj.total_weight)


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_price = serializers.SerializerMethodField()
    product_image_url = serializers.SerializerMethodField()
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_price",
            "product_image_url",
            "quantity",
            "total_price",
        ]
        read_only_fields = ["id", "total_price"]

    def get_product_name(self, obj):
        """Return stored item name if product is deleted, otherwise current product name."""
        if obj.item_name:
            return obj.item_name
        return obj.product.name if obj.product else "Deleted product"

    def get_product_price(self, obj):
        """Return price at order time (item_price) when set, else current product price."""
        if obj.item_price is not None:
            return obj.item_price
        return obj.product.price if obj.product else Decimal("0.00")

    def get_product_image_url(self, obj):
        # Return the image URL if exists
        if obj.product and hasattr(obj.product, "images"):
            first_image = obj.product.images.first()
            return first_image.image_url if first_image else None
        return None

    def get_total_price(self, obj):
        """Use the model's get_total_price method which handles deleted products."""
        return str(obj.get_total_price())


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()
    sum_price = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_first_name = serializers.SerializerMethodField()
    customer_surname = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_address = serializers.SerializerMethodField()
    invoice_link = serializers.SerializerMethodField()
    address = AddressSerializer(read_only=True)
    billing_address = serializers.SerializerMethodField()

    # --- Shipping / Sendcloud fields (read-only, sourced from shipping_details) ---
    shipping_method_id = serializers.SerializerMethodField()
    shipping_tracking_number = serializers.SerializerMethodField()
    shipping_tracking_url = serializers.SerializerMethodField()
    shipping_label_url = serializers.SerializerMethodField()
    shipping_carrier = serializers.SerializerMethodField()
    shipping_service_name = serializers.SerializerMethodField()
    sendcloud_parcel_id = serializers.SerializerMethodField()
    # Human-readable Sendcloud carrier status message (e.g. "In transit", "Delivered").
    shipment_status = serializers.SerializerMethodField()
    # Expected delivery date provided by the carrier via Sendcloud (ISO date string).
    expected_delivery_date = serializers.SerializerMethodField()
    # Datetime confirmed delivered via Sendcloud webhook.
    delivered_at = serializers.SerializerMethodField()
    # Customer-safe error hint when shipping has failed (blank when no issue).
    shipping_error_message = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_first_name",
            "customer_surname",
            "customer_phone",
            "customer_address",
            "address",
            "billing_address",
            "bill_use_delivery_address",
            "notes",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee",
            "discount",
            "status",
            "created_at",
            "invoice_link",
            "payment_intent_id",
            "payment_status",
            "items",
            "sum_price",
            "total_price",
            "total_items",
            # Shipping fields
            "shipping_method_id",
            "shipping_tracking_number",
            "shipping_tracking_url",
            "shipping_label_url",
            "shipping_carrier",
            "shipping_service_name",
            "sendcloud_parcel_id",
            "shipment_status",
            "expected_delivery_date",
            "delivered_at",
            "shipping_error_message",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "sum_price",
            "total_price",
            "total_items",
            "invoice_link",
            "billing_address",
        ]

    def _shipping(self, obj):
        """Return shipping_details or None (avoids repeated try/except)."""
        try:
            return obj.shipping_details
        except Exception:
            return None

    def get_sum_price(self, obj):
        return str(obj.sum_price)

    def get_total_price(self, obj):
        return str(obj.total_price)

    def get_total_items(self, obj):
        return float(obj.total_items)

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.get_display_name()
        return None

    def get_customer_first_name(self, obj):
        if obj.customer:
            return obj.customer.first_name
        return None

    def get_customer_surname(self, obj):
        if obj.customer:
            return obj.customer.surname
        return None

    def get_customer_phone(self, obj):
        if obj.customer and hasattr(obj.customer, "profile"):
            return obj.customer.profile.phone if obj.customer.profile else None
        return None

    def get_customer_address(self, obj):
        # Use order's address if it exists, otherwise fall back to customer's profile address
        if obj.address:
            address = obj.address
            return f"{address.address_line + ', ' if address.address_line else ''}{address.address_line2 + ', ' if address.address_line2 else ''}{address.city + ', ' if address.city else ''}{address.postal_code if address.postal_code else ''}"
        return obj.customer_address

    def get_billing_address(self, obj):
        return obj.billing_address_fields()

    def get_shipping_method_id(self, obj):
        s = self._shipping(obj)
        return s.shipping_method_id if s else None

    def get_shipping_tracking_number(self, obj):
        s = self._shipping(obj)
        if not s:
            return None
        tn = (s.shipping_tracking_number or "").strip()
        return tn or None

    def get_shipping_tracking_url(self, obj):
        s = self._shipping(obj)
        if not s:
            return None
        # Use the model helper which builds Royal Mail fallback URLs.
        url = s.get_tracking_url()
        return url or None

    def get_shipping_label_url(self, obj):
        s = self._shipping(obj)
        if not s:
            return None
        url = (s.provider_label_url or "").strip()
        return url or None

    def get_shipping_carrier(self, obj):
        s = self._shipping(obj)
        if not s:
            return None
        code = (s.carrier_code or "").strip()
        return code or None

    def get_shipping_service_name(self, obj):
        s = self._shipping(obj)
        if not s:
            return None
        inp = s.sendcloud_inputs or {}
        name = str(inp.get("shipping_method_full_name") or "").strip()
        return name or None

    def get_sendcloud_parcel_id(self, obj):
        s = self._shipping(obj)
        return s.sendcloud_parcel_id if s else None

    def get_shipment_status(self, obj):
        """
        Return the human-readable Sendcloud carrier status message
        (e.g. "In transit", "Delivered"). Falls back to None if unavailable.
        """
        s = self._shipping(obj)
        if not s:
            return None
        msg = (s.sendcloud_carrier_status_message or "").strip()
        return msg or None

    def get_expected_delivery_date(self, obj):
        """ISO date string (YYYY-MM-DD) if Sendcloud provided an estimated delivery date."""
        s = self._shipping(obj)
        if not s or not s.expected_delivery_date:
            return None
        return s.expected_delivery_date.isoformat()

    def get_delivered_at(self, obj):
        """ISO datetime string when delivery was confirmed via Sendcloud webhook."""
        s = self._shipping(obj)
        if not s or not s.delivered_at:
            return None
        return s.delivered_at.isoformat()

    def get_shipping_error_message(self, obj):
        """
        Customer-safe shipping error hint. Only exposed when shipping has
        visibly failed; internal technical errors are not forwarded.
        """
        from shipping.models import Shipment as _Shipment

        s = self._shipping(obj)
        if not s:
            return None
        if s.status in (
            _Shipment.Status.FAILED_RETRYABLE,
            _Shipment.Status.FAILED_FINAL,
        ):
            err = (s.last_error or "").strip()
            if err:
                return err[:512]
        return None

    def get_invoice_link(self, obj):
        """
        Return presigned URL for invoice PDF if available.
        Checks Invoice model first, then falls back to Order.invoice_link.
        """
        from billing.models import Invoice
        from django.conf import settings

        # Try to get invoice from Invoice model (preferred)
        try:
            invoice = obj.invoices.latest("created_at")
            if invoice and invoice.invoice_link:
                try:
                    return invoice.get_presigned_invoice_url(expires_in=3600)  # 1 hour expiry
                except Exception:
                    pass
        except Invoice.DoesNotExist:
            pass

        # Fallback to Order.invoice_link (backward compatibility)
        if obj.invoice_link:
            try:
                from billing.models import get_s3_client

                s3 = get_s3_client()
                url = s3.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                        "Key": obj.invoice_link,
                    },
                    ExpiresIn=3600,  # 1 hour expiry
                )
                return url
            except Exception:
                return None

        return None
