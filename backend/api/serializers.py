from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import Order, OrderItem, Product


class ProductSerializer(serializers.ModelSerializer):
    stock_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "image",
            "category",
            "stock_quantity",
        ]

    # def get_stock_quantity(self, obj):
    #     stock = Stock.objects.filter(product=obj).first()
    #     return stock.quantity if stock else 0


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_price = serializers.DecimalField(
        source="product.price", max_digits=10, decimal_places=2, read_only=True
    )
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

    def get_total_price(self, obj):
        if obj.product and obj.quantity:
            return round(obj.product.price * obj.quantity, 2)
        return Decimal("0.00")

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0")
        return value

    def validate(self, data):
        # Additional validation for the entire object
        if "product" in data and "quantity" in data:
            product = data["product"]
            quantity = data["quantity"]

            # Check if product exists and is active
            if not Product.objects.filter(id=product.id).exists():
                raise serializers.ValidationError("Product does not exist")

        return data


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, required=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    total_price = serializers.SerializerMethodField()
    total_items = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "customer",
            "customer_name",
            "notes",
            "delivery_date",
            "is_home_delivery",
            "delivery_fee_manual",
            "delivery_fee",
            "discount",
            "status",
            "order_date",
            "total_price",
            "total_items",
            "items",
        ]
        read_only_fields = [
            "id",
            "customer_name",
            "order_date",
            "total_price",
            "total_items",
        ]

    def get_total_price(self, obj):
        return obj.total_price

    def get_total_items(self, obj):
        return obj.total_items

    def validate_delivery_date(self, value):
        from django.utils import timezone

        if value < timezone.now().date():
            raise serializers.ValidationError("Delivery date cannot be in the past")
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Order must have at least one item")
        return value

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        order = Order.objects.create(**validated_data)

        # Create order items with duplicate prevention
        for item_data in items_data:
            product = item_data["product"]
            quantity = item_data["quantity"]

            # Use get_or_create to prevent duplicates
            order_item, created = OrderItem.objects.get_or_create(
                order=order, product=product, defaults={"quantity": quantity}
            )

            if not created:
                # Item already exists, update quantity
                order_item.quantity += quantity
                order_item.save()

        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)

        # Update order fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update order items if provided
        if items_data is not None:
            # Clear existing items and create new ones with duplicate prevention
            instance.items.all().delete()

            # Group items by product to handle duplicates
            product_quantities = {}
            for item_data in items_data:
                product = item_data["product"]
                quantity = item_data["quantity"]

                if product in product_quantities:
                    product_quantities[product] += quantity
                else:
                    product_quantities[product] = quantity

            # Create items with merged quantities
            for product, total_quantity in product_quantities.items():
                OrderItem.objects.create(
                    order=instance, product=product, quantity=total_quantity
                )

        return instance
