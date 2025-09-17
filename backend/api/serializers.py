from rest_framework import serializers

from .models import Order, OrderItem, Product, ProductCategory


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
