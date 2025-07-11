from rest_framework import serializers

from .models import Order, OrderItem, Product, ProductCategory, Stock


class ProductSerializer(serializers.ModelSerializer):
    stock_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            # "image",
            "categories",
            "stock_quantity",
        ]

    def get_stock_quantity(self, obj):
        stock = Stock.objects.filter(product=obj).first()
        return stock.quantity if stock else 0


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name", "description", "parent"]


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            "id",
            "customer",
            "order_date",
            "status",
            "invoice_link",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee",
            "notes",
            "items",
            "total_price",
            "due_date",
        ]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "quantity", "price", "total_price"]
