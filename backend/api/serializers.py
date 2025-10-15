from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import Order, OrderItem, Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "price",
            "categories",
        ]


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
        # Do not perform blocking validations at serializer-level
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
        items_data = validated_data.pop("items")
        order = Order.objects.create(**validated_data)

        # Create order items without duplicate merging
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)

        # Calculate and update delivery fee and home status
        order.update_delivery_fee_and_home_status()

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
            # Replace items exactly as provided (no merging)
            instance.items.all().delete()
            for item_data in items_data:
                OrderItem.objects.create(order=instance, **item_data)

        # Calculate and update delivery fee and home status
        instance.update_delivery_fee_and_home_status()

        return instance
