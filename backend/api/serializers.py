from decimal import Decimal

from account.serializers import AddressSerializer
from django.db import transaction
from rest_framework import serializers
from shipping.models import ShippingDetails

from .models import (
    Cart,
    CartItem,
    Order,
    OrderItem,
    Product,
    ProductCategory,
    ProductImage,
    Wishlist,
    WishlistItem,
)
from .validators import ProductImageValidationMixin


class CategorySerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), allow_null=True
    )

    class Meta:
        model = ProductCategory
        fields = ["id", "name", "parent", "description"]


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
        ]
        read_only_fields = ["id", "primary_image"]

    def get_categories(self, obj):
        """Return all category names for the product, including parent categories."""
        categories = []
        category_names = set()  # Track what we've already added to prevent duplicates

        for cat in obj.categories.all().order_by("parent__name", "name"):
            # Add the category itself if not already added
            if cat.name not in category_names:
                categories.append(cat.name)
                category_names.add(cat.name)

            # Add parent category if it exists and not already added
            if cat.parent and cat.parent.name not in category_names:
                categories.append(cat.parent.name)
                category_names.add(cat.parent.name)

        return categories

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
        """Return all category names for the product, including parent categories."""
        categories = []
        category_names = set()

        for cat in obj.categories.all().order_by("parent__name", "name"):
            if cat.name not in category_names:
                categories.append(cat.name)
                category_names.add(cat.name)
            if cat.parent and cat.parent.name not in category_names:
                categories.append(cat.parent.name)
                category_names.add(cat.parent.name)

        return categories


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
        """Return stored item price if product is deleted, otherwise current product price."""
        if obj.item_price is not None and not obj.product:
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
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    total_price = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()
    shipping_method_id = serializers.IntegerField(
        source="shipping_details.shipping_method_id",
        allow_null=True,
        required=False,
    )
    shipping_carrier = serializers.CharField(
        source="shipping_details.shipping_carrier",
        allow_blank=True,
        allow_null=True,
        required=False,
    )
    shipping_service_name = serializers.CharField(
        source="shipping_details.shipping_service_name",
        allow_blank=True,
        allow_null=True,
        required=False,
    )
    shipping_cost = serializers.DecimalField(
        source="shipping_details.shipping_cost",
        max_digits=10,
        decimal_places=2,
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
        source="shipping_details.shipping_label_url",
        allow_null=True,
        required=False,
        read_only=True,
    )
    sendcloud_parcel_id = serializers.IntegerField(
        source="shipping_details.sendcloud_parcel_id",
        allow_null=True,
        required=False,
        read_only=True,
    )
    shipping_status = serializers.CharField(
        source="shipping_details.shipping_status",
        allow_null=True,
        required=False,
        read_only=True,
    )
    shipping_error_message = serializers.CharField(
        source="shipping_details.shipping_error_message",
        allow_blank=True,
        allow_null=True,
        required=False,
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
            "items",
            # Shipping fields
            "shipping_method_id",
            "shipping_carrier",
            "shipping_service_name",
            "shipping_cost",
            "shipping_tracking_number",
            "shipping_tracking_url",
            "shipping_label_url",
            "sendcloud_parcel_id",
            "shipping_status",
            "shipping_error_message",
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
            "shipping_status",
            "shipping_error_message",
        ]

    def validate(self, data):
        """Basic validation only; duplicate-prevention removed."""
        return data

    def get_total_price(self, obj):
        return obj.total_price

    def get_total_items(self, obj):
        return obj.total_items

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
            ShippingDetails.objects.create(order=order, **shipping_data)

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
                # Build compute source from current DB items
                compute_source = [
                    {"product": i.product, "quantity": i.quantity}
                    for i in instance.items.all()
                ]

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

        if shipping_data is not None:
            details = getattr(instance, "shipping_details", None)
            if details:
                for key, value in shipping_data.items():
                    setattr(details, key, value)
                details.save()
            else:
                ShippingDetails.objects.create(order=instance, **shipping_data)
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
        """Return only child category names (categories with a parent)."""
        return [
            cat.name
            for cat in obj.product.categories.all().order_by("parent__name", "name")
            if cat.parent is not None
        ]


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
        """Return stored item price if product is deleted, otherwise current product price."""
        if obj.item_price is not None and not obj.product:
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
    customer_phone = serializers.SerializerMethodField()
    customer_address = serializers.SerializerMethodField()
    address = AddressSerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_address",
            "address",
            "notes",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee",
            "discount",
            "status",
            "invoice_link",
            "payment_intent_id",
            "payment_status",
            "items",
            "sum_price",
            "total_price",
            "total_items",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "sum_price",
            "total_price",
            "total_items",
        ]

    def get_sum_price(self, obj):
        return str(obj.sum_price)

    def get_total_price(self, obj):
        return str(obj.total_price)

    def get_total_items(self, obj):
        return float(obj.total_items)

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.name
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
