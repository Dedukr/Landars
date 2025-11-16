from decimal import Decimal

from rest_framework import serializers

from .models import (
    Cart,
    CartItem,
    Order,
    OrderItem,
    Product,
    ProductCategory,
    Wishlist,
    WishlistItem,
)


class CategorySerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), allow_null=True
    )

    class Meta:
        model = ProductCategory
        fields = ["id", "name", "parent", "description"]


class ProductSerializer(serializers.ModelSerializer):
    categories = serializers.SerializerMethodField()
    # stock_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            # "image",
            "categories",
            # "stock_quantity",
        ]

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
        min_value=Decimal("0"),
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
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_price = serializers.DecimalField(
        source="product.price",
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0"),
        read_only=True,
    )
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

    def get_product_image_url(self, obj):
        # Return the image URL if exists
        if hasattr(obj.product, "image") and obj.product.image:
            return obj.product.image.url
        return None

    def get_total_price(self, obj):
        return str(obj.get_total_price())


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_address = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_address",
            "notes",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee",
            "discount",
            "order_date",
            "status",
            "invoice_link",
            "payment_intent_id",
            "payment_status",
            "items",
            "total_price",
            "total_items",
        ]
        read_only_fields = ["id", "order_date", "total_price", "total_items"]

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
        return obj.customer_address
