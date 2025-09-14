from rest_framework import serializers

from .models import Order, OrderItem, Product, ProductCategory


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
