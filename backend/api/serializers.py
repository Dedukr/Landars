from rest_framework import serializers

from .models import Order, OrderItem, Product, ProductCategory, Wishlist


class CategorySerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), allow_null=True
    )

    class Meta:
        model = ProductCategory
        fields = ["id", "name", "parent", "description"]


class ProductSerializer(serializers.ModelSerializer):
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

    # def get_stock_quantity(self, obj):
    #     stock = Stock.objects.filter(product=obj).first()
    #     return stock.quantity if stock else 0


class WishlistSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_price = serializers.DecimalField(
        source="product.price", max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = Wishlist
        fields = ["id", "product", "product_name", "product_price", "added_date"]
        read_only_fields = ["id", "added_date"]
