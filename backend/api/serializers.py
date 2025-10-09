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
        """Return only child category names (categories with a parent)."""
        return [
            cat.name
            for cat in obj.categories.all().order_by("parent__name", "name")
            if cat.parent is not None
        ]

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
    total_items = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            "id",
            "items",
            "total_price",
            "total_items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_total_price(self, obj):
        return str(obj.total_price)

    def get_total_items(self, obj):
        return float(obj.total_items)
